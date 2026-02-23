import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Utils } from "electrobun/bun";
import type { TrackHistoryEntry } from "../shared/rpc";

const HISTORY_FILENAME = "track-history.json";
const WAVEFORM_CACHE_DIR = "waveforms";

export const getWaveformCacheDir = () =>
    join(Utils.paths.userCache, WAVEFORM_CACHE_DIR);

const getHistoryPath = () => join(Utils.paths.userData, HISTORY_FILENAME);

export const ensureStorageDirs = async () => {
    await mkdir(Utils.paths.userData, { recursive: true });
    await mkdir(getWaveformCacheDir(), { recursive: true });
};

export const readHistory = async (): Promise<TrackHistoryEntry[]> => {
    await ensureStorageDirs();
    try {
        const raw = await readFile(getHistoryPath(), "utf8");
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed
            .filter((item): item is TrackHistoryEntry => {
                if (typeof item !== "object" || item === null) {
                    return false;
                }
                const candidate = item as Partial<TrackHistoryEntry>;
                return (
                    typeof candidate.id === "string" &&
                    typeof candidate.path === "string" &&
                    typeof candidate.name === "string" &&
                    typeof candidate.type === "string" &&
                    typeof candidate.size === "number" &&
                    typeof candidate.duration === "number" &&
                    typeof candidate.sampleRate === "number" &&
                    typeof candidate.channels === "number" &&
                    typeof candidate.createdAt === "number"
                );
            })
            .sort((a, b) => b.createdAt - a.createdAt);
    } catch {
        return [];
    }
};

const writeHistory = async (records: TrackHistoryEntry[]) => {
    await ensureStorageDirs();
    await writeFile(getHistoryPath(), JSON.stringify(records, null, 2), "utf8");
};

export const upsertHistory = async (
    entry: TrackHistoryEntry,
    maxItems = 12,
) => {
    const existing = await readHistory();
    const existingIndex = existing.findIndex((item) => item.id === entry.id);

    let next: TrackHistoryEntry[];
    if (existingIndex >= 0) {
        const previous = existing[existingIndex];
        const updated: TrackHistoryEntry = {
            ...entry,
            createdAt: previous.createdAt,
        };
        next = [
            ...existing.slice(0, existingIndex),
            updated,
            ...existing.slice(existingIndex + 1),
        ];
    } else {
        next = [{ ...entry, createdAt: Date.now() }, ...existing];
    }

    next = next.sort((a, b) => b.createdAt - a.createdAt).slice(0, maxItems);
    await writeHistory(next);
};
