import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { BrowserView, BrowserWindow, Updater, Utils } from "electrobun/bun";
import type { GroovRPC } from "../shared/rpc";
import { readHistory, removeHistoryById, upsertHistory } from "./historyStore";
import { loadTrackPayloadByPath } from "./trackPayloadCache";
import { analyzeWaveform } from "./waveformAnalysis";
import { readWaveformFromCache, writeWaveformToCache } from "./waveformCache";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
const DROPPED_TRACK_DIR = join(tmpdir(), "groov-dropped-tracks");

let mainWindow: BrowserWindow<
    ReturnType<typeof BrowserView.defineRPC<GroovRPC>>
> | null = null;

const canceledTokens = new Set<number>();

const extensionFromMime = (mime: string): string => {
    const normalized = mime.toLowerCase();
    if (normalized.includes("mpeg")) {
        return ".mp3";
    }
    if (normalized.includes("wav")) {
        return ".wav";
    }
    if (normalized.includes("flac")) {
        return ".flac";
    }
    if (normalized.includes("aac")) {
        return ".aac";
    }
    if (normalized.includes("ogg") || normalized.includes("opus")) {
        return ".ogg";
    }
    if (normalized.includes("mp4") || normalized.includes("m4a")) {
        return ".m4a";
    }
    if (normalized.includes("aiff")) {
        return ".aiff";
    }
    if (normalized.includes("webm")) {
        return ".webm";
    }
    return ".audio";
};

const materializeDroppedTrack = async (
    name: string,
    type: string,
    audioBase64: string,
): Promise<string> => {
    const bytes = Buffer.from(audioBase64, "base64");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const inputExt = extname(name).trim().toLowerCase();
    const extension = inputExt || extensionFromMime(type);
    const filePath = join(DROPPED_TRACK_DIR, `${digest}${extension}`);
    await mkdir(DROPPED_TRACK_DIR, { recursive: true });

    try {
        await writeFile(filePath, bytes, { flag: "wx" });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
            throw error;
        }
    }

    return filePath;
};

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
            loadTrackByPath: async ({ path }) => {
                try {
                    return await loadTrackPayloadByPath(path);
                } catch {
                    return null;
                }
            },
            loadDroppedTrack: async ({ name, type, audioBase64 }) => {
                try {
                    const filePath = await materializeDroppedTrack(
                        name,
                        type,
                        audioBase64,
                    );
                    const payload = await loadTrackPayloadByPath(filePath);
                    return {
                        ...payload,
                        name: name.trim() || payload.name,
                        type: type.trim() || payload.type,
                    };
                } catch {
                    return null;
                }
            },
            loadTrackById: async ({ id }) => {
                const history = await readHistory();
                const target = history.find((item) => item.id === id);
                if (!target) {
                    return null;
                }

                return loadTrackPayloadByPath(target.path);
            },
            removeTrackById: async ({ id }) => {
                await removeHistoryById(id);
                return { ok: true } as const;
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
