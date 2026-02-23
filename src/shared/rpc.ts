import type { RPCSchema } from "electrobun/view";

export type TrackHistoryEntry = {
    id: string;
    path: string;
    name: string;
    type: string;
    size: number;
    duration: number;
    sampleRate: number;
    channels: number;
    createdAt: number;
};

export type SelectedTrackPayload = {
    id: string;
    path: string;
    name: string;
    type: string;
    size: number;
    audioBase64: string;
};

export type WaveformPayload = {
    peaks: number[];
    bands: number[];
    bpm: number | null;
    bpmConfidence: number;
    beatOffset: number;
    beatsPerBar: number;
};

export type GroovRPC = {
    bun: RPCSchema<{
        requests: {
            pickTrack: {
                params: Record<string, never>;
                response: SelectedTrackPayload | null;
            };
            loadTrackById: {
                params: { id: string };
                response: SelectedTrackPayload | null;
            };
            listTrackHistory: {
                params: Record<string, never>;
                response: TrackHistoryEntry[];
            };
            upsertTrackHistory: {
                params: { entry: TrackHistoryEntry; maxItems?: number };
                response: { ok: true };
            };
            analyzeWaveform: {
                params: {
                    analysisKey: string;
                    filePath: string;
                    resolution?: number;
                    token: number;
                };
                response: WaveformPayload;
            };
            cancelWaveformAnalysis: {
                params: { token: number };
                response: { ok: true };
            };
        };
        messages: Record<string, never>;
    }>;
    webview: RPCSchema<{
        requests: Record<string, never>;
        messages: {
            analysisProgress: {
                token: number;
                stage: "cache" | "probe" | "decode" | "analyze";
                progress: number;
            };
        };
    }>;
};
