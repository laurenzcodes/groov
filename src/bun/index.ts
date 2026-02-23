import { BrowserView, BrowserWindow, Updater, Utils } from "electrobun/bun";
import type { GroovRPC } from "../shared/rpc";
import { readHistory, upsertHistory } from "./historyStore";
import { loadTrackPayloadByPath } from "./trackPayloadCache";
import { analyzeWaveform } from "./waveformAnalysis";
import { readWaveformFromCache, writeWaveformToCache } from "./waveformCache";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

let mainWindow: BrowserWindow<
    ReturnType<typeof BrowserView.defineRPC<GroovRPC>>
> | null = null;

const canceledTokens = new Set<number>();

const sendProgress = (
    token: number,
    stage: "cache" | "probe" | "decode" | "analyze",
    progress: number,
) => {
    const rpc = mainWindow?.webview.rpc;
    if (!rpc) {
        return;
    }

    rpc.send.analysisProgress({
        token,
        stage,
        progress: Math.max(0, Math.min(1, progress)),
    });
};

async function getMainViewUrl(): Promise<string> {
    const channel = await Updater.localInfo.channel();
    if (channel === "dev") {
        try {
            await fetch(DEV_SERVER_URL, { method: "HEAD" });
            console.log(
                `HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`,
            );
            return DEV_SERVER_URL;
        } catch {
            console.log(
                "Vite dev server not running. Run 'bun run dev:hmr' for HMR support.",
            );
        }
    }
    return "views://mainview/index.html";
}

const rpc = BrowserView.defineRPC<GroovRPC>({
    maxRequestTime: Infinity,
    handlers: {
        requests: {
            pickTrack: async () => {
                const selected = await Utils.openFileDialog({
                    canChooseFiles: true,
                    canChooseDirectory: false,
                    allowsMultipleSelection: false,
                    allowedFileTypes: "*",
                });

                const path = selected[0];
                if (!path) {
                    return null;
                }

                return loadTrackPayloadByPath(path);
            },
            loadTrackById: async ({ id }) => {
                const history = await readHistory();
                const target = history.find((item) => item.id === id);
                if (!target) {
                    return null;
                }

                return loadTrackPayloadByPath(target.path);
            },
            listTrackHistory: async () => readHistory(),
            upsertTrackHistory: async ({ entry, maxItems }) => {
                await upsertHistory(entry, maxItems ?? 12);
                return { ok: true } as const;
            },
            cancelWaveformAnalysis: async ({ token }) => {
                canceledTokens.add(token);
                return { ok: true } as const;
            },
            analyzeWaveform: async ({
                analysisKey,
                filePath,
                resolution = 12288,
                token,
            }) => {
                canceledTokens.delete(token);
                sendProgress(token, "cache", 0);

                const cached = await readWaveformFromCache(analysisKey);
                if (cached) {
                    sendProgress(token, "cache", 1);
                    return cached;
                }

                const analyzed = await analyzeWaveform({
                    filePath,
                    resolution,
                    token,
                    canceledTokens,
                    onProgress: (stage, progress) =>
                        sendProgress(token, stage, progress),
                });

                await writeWaveformToCache(analysisKey, analyzed);
                return analyzed;
            },
        },
        messages: {},
    },
});

const url = await getMainViewUrl();

mainWindow = new BrowserWindow({
    title: "GROOV",
    url,
    rpc,
    frame: {
        width: 900,
        height: 700,
        x: 200,
        y: 200,
    },
});

mainWindow.on("close", () => {
    Utils.quit();
});

console.log("Groov app started!");
