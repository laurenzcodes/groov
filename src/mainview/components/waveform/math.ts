export const TIMELINE_STEPS_SECONDS = [
    1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600,
];

export const pickTimelineStep = (minimumStepSeconds: number) => {
    for (const step of TIMELINE_STEPS_SECONDS) {
        if (step >= minimumStepSeconds) {
            return step;
        }
    }

    const largestKnownStep =
        TIMELINE_STEPS_SECONDS[TIMELINE_STEPS_SECONDS.length - 1] ?? 3600;
    return Math.ceil(minimumStepSeconds / largestKnownStep) * largestKnownStep;
};

export const isMultipleOf = (value: number, step: number) => {
    const ratio = value / step;
    return Math.abs(ratio - Math.round(ratio)) < 1e-6;
};

export const bandColor = (
    low: number,
    mid: number,
    high: number,
    amp: number,
) => {
    const boostPower = 1.45;
    const lowBoost = Math.max(0, low) ** boostPower;
    const midBoost = Math.max(0, mid) ** boostPower;
    const highBoost = Math.max(0, high) ** boostPower;
    const sum = lowBoost + midBoost + highBoost + 1e-6;

    const nLow = lowBoost / sum;
    const nMid = midBoost / sum;
    const nHigh = highBoost / sum;
    const loudnessLift = 34 + amp * 62;
    const red = Math.min(
        255,
        Math.max(18, nLow * 220 + nMid * 26 + loudnessLift),
    );
    const green = Math.min(
        255,
        Math.max(18, nMid * 224 + nHigh * 18 + loudnessLift),
    );
    const blue = Math.min(
        255,
        Math.max(18, nHigh * 220 + nMid * 30 + loudnessLift),
    );
    return `rgb(${Math.round(red)} ${Math.round(green)} ${Math.round(blue)})`;
};

export const getPercentileNormalizer = (
    peaks: Float32Array,
    fromIndex: number,
    toIndex: number,
) => {
    const start = Math.max(0, fromIndex);
    const end = Math.min(peaks.length - 1, toIndex);
    const span = Math.max(1, end - start + 1);
    const stride = Math.max(1, Math.floor(span / 768));
    const values: number[] = [];

    for (let i = start; i <= end; i += stride) {
        values.push(peaks[i] ?? 0);
    }

    values.sort((a, b) => a - b);
    const pick = (percentile: number) =>
        values[
            Math.min(values.length - 1, Math.floor(values.length * percentile))
        ] ?? 0;

    const p03 = pick(0.03);
    const p90 = pick(0.9);
    const p995 = pick(0.995);
    const low = p03;
    const high = Math.max(low + 1e-4, p995);
    const midSpan = Math.max(1e-4, p90 - low);

    return { low, high, midSpan };
};

export const sampleWavePoint = (
    time: number,
    duration: number,
    peaks: Float32Array,
    bands: Float32Array,
) => {
    const normalized = Math.min(Math.max(0, time / duration), 1);
    const indexFloat = normalized * (peaks.length - 1);
    const left = Math.floor(indexFloat);
    const right = Math.min(peaks.length - 1, left + 1);
    const mix = indexFloat - left;
    const invMix = 1 - mix;

    const amp = (peaks[left] ?? 0) * invMix + (peaks[right] ?? 0) * mix;
    const low = (bands[left * 3] ?? 0) * invMix + (bands[right * 3] ?? 0) * mix;
    const mid =
        (bands[left * 3 + 1] ?? 0) * invMix + (bands[right * 3 + 1] ?? 0) * mix;
    const high =
        (bands[left * 3 + 2] ?? 0) * invMix + (bands[right * 3 + 2] ?? 0) * mix;

    return { amp, low, mid, high };
};

export const smoothWavePoint = (
    timeAtX: number,
    secondsPerPixel: number,
    duration: number,
    peaks: Float32Array,
    bands: Float32Array,
) => {
    const point = sampleWavePoint(timeAtX, duration, peaks, bands);
    const prev = sampleWavePoint(
        Math.max(0, timeAtX - secondsPerPixel),
        duration,
        peaks,
        bands,
    );
    const next = sampleWavePoint(
        Math.min(duration, timeAtX + secondsPerPixel),
        duration,
        peaks,
        bands,
    );

    return {
        amp: prev.amp * 0.25 + point.amp * 0.5 + next.amp * 0.25,
        low: prev.low * 0.25 + point.low * 0.5 + next.low * 0.25,
        mid: prev.mid * 0.25 + point.mid * 0.5 + next.mid * 0.25,
        high: prev.high * 0.25 + point.high * 0.5 + next.high * 0.25,
    };
};
