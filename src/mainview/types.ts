export type TrackInfo = {
    name: string;
    type: string;
    size: number;
    sampleRate: number;
    channels: number;
};

export type WaveformData = {
    peaks: Float32Array;
    bands: Float32Array;
    bpm: number | null;
    bpmConfidence: number;
    beatOffset: number;
    beatsPerBar: number;
};

export type TimelineMode = "time" | "beats";
