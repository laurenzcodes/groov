import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import type { SelectedTrackPayload } from "../shared/rpc";

const TRACK_PAYLOAD_CACHE_LIMIT = 8;

const trackPayloadCache = new Map<string, SelectedTrackPayload>();

const mimeByExtension: Record<string, string> = {
    ".aac": "audio/aac",
    ".aif": "audio/aiff",
    ".aiff": "audio/aiff",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".opus": "audio/ogg",
    ".wav": "audio/wav",
    ".webm": "audio/webm",
};

const hashString = (value: string) =>
    createHash("sha256").update(value).digest("hex");

const buildTrackId = (path: string, size: number, mtimeMs: number) =>
    `${hashString(path).slice(0, 20)}:${size}:${Math.floor(mtimeMs)}`;

const inferMimeType = (path: string) => {
    const extension = extname(path).toLowerCase();
    return mimeByExtension[extension] ?? "audio/*";
};

export const loadTrackPayloadByPath = async (
    path: string,
): Promise<SelectedTrackPayload> => {
    const fileStat = await stat(path);
    const id = buildTrackId(path, fileStat.size, fileStat.mtimeMs);
    const cached = trackPayloadCache.get(id);

    if (cached) {
        trackPayloadCache.delete(id);
        trackPayloadCache.set(id, cached);
        return cached;
    }

    const bytes = await readFile(path);
    const payload: SelectedTrackPayload = {
        id,
        path,
        name: path.split(/[\\/]/).pop() ?? path,
        type: inferMimeType(path),
        size: fileStat.size,
        audioBase64: bytes.toString("base64"),
    };

    for (const [cacheId, cacheItem] of trackPayloadCache.entries()) {
        if (cacheItem.path === path && cacheId !== id) {
            trackPayloadCache.delete(cacheId);
        }
    }

    trackPayloadCache.set(id, payload);
    while (trackPayloadCache.size > TRACK_PAYLOAD_CACHE_LIMIT) {
        const oldestId = trackPayloadCache.keys().next().value;
        if (!oldestId) {
            break;
        }
        trackPayloadCache.delete(oldestId);
    }

    return payload;
};
