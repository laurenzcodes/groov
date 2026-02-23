import { createHash } from "node:crypto";
import { join } from "node:path";
import type { WaveformPayload } from "../shared/rpc";
import { ensureStorageDirs, getWaveformCacheDir } from "./historyStore";

const WAVEFORM_CACHE_VERSION = 3;

const hashString = (value: string) =>
    createHash("sha256").update(value).digest("hex");

const waveformCachePath = (analysisKey: string) => {
    const fileKey = hashString(`${WAVEFORM_CACHE_VERSION}:${analysisKey}`);
    return join(getWaveformCacheDir(), `${fileKey}.bin`);
};

const encodeWaveformBinary = (payload: WaveformPayload): Uint8Array => {
    const peaks = Float32Array.from(payload.peaks);
    const bands = Float32Array.from(payload.bands);
    const header = Buffer.allocUnsafe(24);
    header.writeUInt32LE(peaks.length, 0);
    header.writeUInt32LE(bands.length, 4);
    header.writeFloatLE(payload.bpm ?? Number.NaN, 8);
    header.writeFloatLE(payload.bpmConfidence, 12);
    header.writeFloatLE(payload.beatOffset, 16);
    header.writeUInt32LE(payload.beatsPerBar, 20);
    return new Uint8Array(
        Buffer.concat([
            header,
            Buffer.from(peaks.buffer, peaks.byteOffset, peaks.byteLength),
            Buffer.from(bands.buffer, bands.byteOffset, bands.byteLength),
        ]),
    );
};

const decodeWaveformBinary = (bytes: Uint8Array): WaveformPayload | null => {
    if (bytes.byteLength < 24) {
        return null;
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const peaksLength = view.getUint32(0, true);
    const bandsLength = view.getUint32(4, true);
    const bpmRaw = view.getFloat32(8, true);
    const bpmConfidence = view.getFloat32(12, true);
    const beatOffset = view.getFloat32(16, true);
    const beatsPerBar = view.getUint32(20, true);
    const expectedBytes = 24 + (peaksLength + bandsLength) * 4;

    if (bytes.byteLength !== expectedBytes) {
        return null;
    }

    const peaksStart = 24;
    const peaksEnd = peaksStart + peaksLength * 4;
    const bandsStart = peaksEnd;
    const bandsEnd = bandsStart + bandsLength * 4;

    const peaksBuffer = bytes.buffer.slice(
        bytes.byteOffset + peaksStart,
        bytes.byteOffset + peaksEnd,
    );
    const bandsBuffer = bytes.buffer.slice(
        bytes.byteOffset + bandsStart,
        bytes.byteOffset + bandsEnd,
    );

    return {
        peaks: Array.from(new Float32Array(peaksBuffer)),
        bands: Array.from(new Float32Array(bandsBuffer)),
        bpm: Number.isFinite(bpmRaw) ? bpmRaw : null,
        bpmConfidence: Number.isFinite(bpmConfidence) ? bpmConfidence : 0,
        beatOffset: Number.isFinite(beatOffset) ? beatOffset : 0,
        beatsPerBar: Math.max(1, beatsPerBar || 4),
    };
};

export const readWaveformFromCache = async (
    analysisKey: string,
): Promise<WaveformPayload | null> => {
    await ensureStorageDirs();
    try {
        const file = Bun.file(waveformCachePath(analysisKey));
        if (!(await file.exists())) {
            return null;
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        return decodeWaveformBinary(bytes);
    } catch {
        return null;
    }
};

export const writeWaveformToCache = async (
    analysisKey: string,
    payload: WaveformPayload,
): Promise<void> => {
    try {
        await ensureStorageDirs();
        const encoded = encodeWaveformBinary(payload);
        await Bun.write(waveformCachePath(analysisKey), encoded);
    } catch {
        // Cache is best effort.
    }
};
