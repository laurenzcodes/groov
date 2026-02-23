import type { WaveformPayload } from "../../shared/rpc";
import type { WaveformData } from "../types";

export const WAVEFORM_RESOLUTION = 12288;
export const MAX_TRACK_CACHE_ITEMS = 4;
export const HISTORY_MAX_ITEMS = 12;

export const waveformFromPayload = (
    payload: WaveformPayload,
): WaveformData => ({
    peaks: Float32Array.from(payload.peaks),
    bands: Float32Array.from(payload.bands),
    bpm: payload.bpm,
    bpmConfidence: payload.bpmConfidence,
    beatOffset: payload.beatOffset,
    beatsPerBar: payload.beatsPerBar,
});

export const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return bytes.buffer;
};
