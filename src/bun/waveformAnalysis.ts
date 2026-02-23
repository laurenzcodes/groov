import type { WaveformPayload } from "../shared/rpc";

export type AnalysisStage = "cache" | "probe" | "decode" | "analyze";

export type AnalyzeWaveformInput = {
    filePath: string;
    resolution: number;
    token: number;
    canceledTokens: Set<number>;
    onProgress: (stage: AnalysisStage, progress: number) => void;
};

type BeatAnalysis = {
    bpm: number | null;
    bpmConfidence: number;
    beatOffset: number;
    beatsPerBar: number;
};

const EMPTY_BEAT_ANALYSIS: BeatAnalysis = {
    bpm: null,
    bpmConfidence: 0,
    beatOffset: 0,
    beatsPerBar: 4,
};

const runCommand = async (cmd: string[]) => {
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);

    if (code !== 0) {
        throw new Error(stderr || stdout || `Command failed: ${cmd.join(" ")}`);
    }

    return stdout;
};

const decodeMonoPcm = async (
    filePath: string,
): Promise<{ samples: Float32Array; sampleRate: number }> => {
    const probeRaw = await runCommand([
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=sample_rate",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
    ]);

    const sampleRate = Number(probeRaw.trim()) || 44100;

    const decodeProc = Bun.spawn(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            filePath,
            "-ac",
            "1",
            "-f",
            "f32le",
            "pipe:1",
        ],
        { stdout: "pipe", stderr: "pipe" },
    );

    const [pcmBuffer, stderr, code] = await Promise.all([
        new Response(decodeProc.stdout).arrayBuffer(),
        new Response(decodeProc.stderr).text(),
        decodeProc.exited,
    ]);

    if (code !== 0) {
        throw new Error(stderr || "ffmpeg decode failed");
    }

    return {
        samples: new Float32Array(pcmBuffer),
        sampleRate,
    };
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const analyzeBands = (
    signal: Float32Array,
    sampleRate: number,
): [number, number, number] => {
    const fftSize = signal.length;
    let low = 0;
    let mid = 0;
    let high = 0;

    for (let k = 1; k <= fftSize / 2; k += 1) {
        let re = 0;
        let im = 0;

        for (let n = 0; n < fftSize; n += 1) {
            const angle = (2 * Math.PI * k * n) / fftSize;
            re += signal[n] * Math.cos(angle);
            im -= signal[n] * Math.sin(angle);
        }

        const magnitude = Math.sqrt(re * re + im * im);
        const frequency = (k * sampleRate) / fftSize;

        if (frequency <= 220) {
            low += magnitude;
        } else if (frequency <= 2400) {
            mid += magnitude;
        } else if (frequency <= 9000) {
            high += magnitude;
        }
    }

    const sum = low + mid + high || 1;
    return [low / sum, mid / sum, high / sum];
};

const normalizeBand = (input: Float32Array): Float32Array => {
    const sorted = Array.from(input).sort((a, b) => a - b);
    const p10 = sorted[Math.floor(sorted.length * 0.1)] ?? 0;
    const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 1;
    const span = Math.max(1e-6, p90 - p10);
    const output = new Float32Array(input.length);

    for (let i = 0; i < input.length; i += 1) {
        const normalized = clamp01((input[i] - p10) / span);
        output[i] = normalized ** 0.72;
    }

    return output;
};

const throwIfCanceled = (token: number, canceledTokens: Set<number>) => {
    if (canceledTokens.has(token)) {
        throw new Error("analysis canceled");
    }
};

const wrap = (value: number, period: number): number => {
    if (period <= 0) {
        return value;
    }
    const wrapped = value % period;
    return wrapped < 0 ? wrapped + period : wrapped;
};

const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

const parabolicPeakOffset = (
    left: number,
    center: number,
    right: number,
): number => {
    const denominator = left - 2 * center + right;
    if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-8) {
        return 0;
    }
    return clamp((0.5 * (left - right)) / denominator, -0.5, 0.5);
};

const computeMultiBandOnset = (
    monoSamples: Float32Array,
    sampleRate: number,
    hopSize: number,
): Float32Array => {
    const frameCount = Math.floor(monoSamples.length / hopSize);
    if (frameCount < 2) {
        return new Float32Array(0);
    }

    const onset = new Float32Array(frameCount);

    const lowCutoff = 200;
    const midLowCutoff = 400;
    const midCutoff = 2000;
    const highCutoff = 8000;

    const lowAlpha = 1 - Math.exp((-2 * Math.PI * lowCutoff) / sampleRate);
    const midLowAlpha =
        1 - Math.exp((-2 * Math.PI * midLowCutoff) / sampleRate);
    const midAlpha = 1 - Math.exp((-2 * Math.PI * midCutoff) / sampleRate);
    const highAlpha = 1 - Math.exp((-2 * Math.PI * highCutoff) / sampleRate);

    let lowState = 0;
    let midLowState = 0;
    let midState = 0;
    let highState = 0;

    let prevLowEnergy = 0;
    let prevMidLowEnergy = 0;
    let prevMidEnergy = 0;
    let prevHighEnergy = 0;

    for (let frame = 0; frame < frameCount; frame++) {
        const start = frame * hopSize;
        const end = Math.min(start + hopSize, monoSamples.length);

        let lowEnergy = 0;
        let midLowEnergy = 0;
        let midEnergy = 0;
        let highEnergy = 0;
        let totalEnergy = 0;

        for (let i = start; i < end; i++) {
            const sample = monoSamples[i] ?? 0;
            const absSample = Math.abs(sample);
            totalEnergy += absSample;

            lowState += lowAlpha * (sample - lowState);
            midLowState += midLowAlpha * (sample - midLowState);
            midState += midAlpha * (sample - midState);
            highState += highAlpha * (sample - highState);

            lowEnergy += Math.abs(lowState);
            midLowEnergy += Math.abs(midLowState - lowState);
            midEnergy += Math.abs(midState - midLowState);
            highEnergy += Math.abs(sample - midState);
        }

        const frameLen = Math.max(1, end - start);
        lowEnergy /= frameLen;
        midLowEnergy /= frameLen;
        midEnergy /= frameLen;
        highEnergy /= frameLen;
        totalEnergy /= frameLen;

        const lowDiff = Math.max(0, lowEnergy - prevLowEnergy);
        const midLowDiff = Math.max(0, midLowEnergy - prevMidLowEnergy);
        const midDiff = Math.max(0, midEnergy - prevMidEnergy);
        const highDiff = Math.max(0, highEnergy - prevHighEnergy);

        onset[frame] =
            lowDiff * 2.5 +
            midLowDiff * 1.8 +
            midDiff * 1.0 +
            highDiff * 0.5 +
            totalEnergy * 0.1;

        prevLowEnergy = lowEnergy;
        prevMidLowEnergy = midLowEnergy;
        prevMidEnergy = midEnergy;
        prevHighEnergy = highEnergy;
    }

    const adaptiveWindow = Math.max(8, Math.floor(sampleRate / hopSize / 8));
    const adaptedOnset = new Float32Array(frameCount);
    const history = new Float32Array(adaptiveWindow);
    let historySum = 0;
    let historySqSum = 0;

    for (let i = 0; i < frameCount; i++) {
        const oldest = history[i % adaptiveWindow];
        historySum -= oldest;
        historySqSum -= oldest * oldest;

        history[i % adaptiveWindow] = onset[i];
        historySum += onset[i];
        historySqSum += onset[i] * onset[i];

        const count = Math.min(i + 1, adaptiveWindow);
        const mean = historySum / count;
        const variance = Math.max(0, historySqSum / count - mean * mean);
        const std = Math.sqrt(variance) + 1e-8;

        adaptedOnset[i] = Math.max(0, (onset[i] - mean) / std);
    }

    return adaptedOnset;
};

const findBestTempo = (
    onset: Float32Array,
    sampleRate: number,
    hopSize: number,
): { periodFrames: number; confidence: number } => {
    const frameRate = sampleRate / hopSize;
    const minBpm = 60;
    const maxBpm = 220;
    const minLag = Math.floor((60 * frameRate) / maxBpm);
    const maxLag = Math.floor((60 * frameRate) / minBpm);

    if (maxLag <= minLag + 1 || onset.length < maxLag * 2) {
        return { periodFrames: frameRate / 2, confidence: 0 };
    }

    const acf = new Float32Array(maxLag + 1);
    const analysisLength = onset.length;

    for (let lag = minLag; lag <= maxLag; lag++) {
        let sum = 0;
        let count = 0;
        for (let i = lag; i < analysisLength; i++) {
            sum += onset[i] * onset[i - lag];
            count++;
        }
        acf[lag] = sum / Math.max(1, count);
    }

    const combFilter = new Float32Array(maxLag + 1);
    for (let lag = minLag; lag <= maxLag; lag++) {
        let score = acf[lag];
        const bpm = (60 * frameRate) / lag;

        const halfLag = Math.round(lag / 2);
        const doubleLag = lag * 2;
        const tripleLag = lag * 3;

        if (halfLag >= minLag) score += acf[halfLag] * 0.5;
        if (doubleLag <= maxLag) score += acf[doubleLag] * 0.5;
        if (tripleLag <= maxLag) score += acf[tripleLag] * 0.25;

        if (bpm >= 100 && bpm <= 140) score *= 1.15;
        else if (bpm >= 85 && bpm <= 160) score *= 1.05;

        combFilter[lag] = score;
    }

    let bestLag = minLag;
    let bestScore = -Infinity;
    let secondBestScore = -Infinity;

    for (let lag = minLag; lag <= maxLag; lag++) {
        if (combFilter[lag] > bestScore) {
            secondBestScore = bestScore;
            bestScore = combFilter[lag];
            bestLag = lag;
        } else if (combFilter[lag] > secondBestScore) {
            secondBestScore = combFilter[lag];
        }
    }

    const leftLag = Math.max(minLag, bestLag - 1);
    const rightLag = Math.min(maxLag, bestLag + 1);
    const refinedLag =
        bestLag +
        parabolicPeakOffset(
            combFilter[leftLag] ?? bestScore,
            combFilter[bestLag] ?? bestScore,
            combFilter[rightLag] ?? bestScore,
        );

    const halfLag = Math.round(refinedLag / 2);
    const bpmAtBest = (60 * frameRate) / refinedLag;
    const bpmAtHalf = (60 * frameRate) / halfLag;

    if (
        halfLag >= minLag &&
        bpmAtBest < 100 &&
        bpmAtHalf >= 100 &&
        bpmAtHalf <= 180
    ) {
        const halfScore = combFilter[halfLag] ?? 0;
        if (halfScore > bestScore * 0.7) {
            return {
                periodFrames: halfLag,
                confidence: clamp01((halfScore / (bestScore + 0.001)) * 0.8),
            };
        }
    }

    const contrast = (bestScore - secondBestScore) / (bestScore + 0.001);
    const confidence = clamp01(contrast * 2);

    return { periodFrames: refinedLag, confidence };
};

const dynamicProgrammingBeatTrack = (
    onset: Float32Array,
    periodFrames: number,
): number[] => {
    const n = onset.length;
    if (n < 4) return [];

    const transitionLambda = 100;
    const periodTolerance = 0.2;
    const minPeriod = periodFrames * (1 - periodTolerance);
    const maxPeriod = periodFrames * (1 + periodTolerance);

    const score = new Float32Array(n);
    const predecessor = new Int32Array(n).fill(-1);

    for (let i = 0; i < n; i++) {
        score[i] = onset[i];
    }

    for (let i = 1; i < n; i++) {
        const searchStart = Math.max(0, Math.floor(i - maxPeriod));
        const searchEnd = Math.max(0, Math.floor(i - minPeriod));

        let bestPrev = -1;
        let bestPrevScore = onset[i];

        for (let j = searchEnd; j >= searchStart; j--) {
            const interval = i - j;
            const deviation = Math.abs(interval - periodFrames) / periodFrames;
            const transitionPenalty = transitionLambda * deviation * deviation;
            const candidateScore = score[j] + onset[i] - transitionPenalty;

            if (candidateScore > bestPrevScore) {
                bestPrevScore = candidateScore;
                bestPrev = j;
            }
        }

        score[i] = bestPrevScore;
        predecessor[i] = bestPrev;
    }

    let bestEnd = 0;
    for (let i = 1; i < n; i++) {
        if (score[i] > score[bestEnd]) {
            bestEnd = i;
        }
    }

    const beatsReverse: number[] = [];
    let current = bestEnd;
    while (current >= 0) {
        beatsReverse.push(current);
        current = predecessor[current];
    }

    return beatsReverse.reverse();
};

const refineBeatsToSamples = (
    beatFrames: number[],
    onset: Float32Array,
    monoSamples: Float32Array,
    hopSize: number,
): number[] => {
    const refinedBeats: number[] = [];
    const searchRadius = Math.floor(hopSize * 0.8);

    for (const frame of beatFrames) {
        const approximateSample = frame * hopSize;
        const searchStart = Math.max(0, approximateSample - searchRadius);
        const searchEnd = Math.min(
            monoSamples.length - 2,
            approximateSample + searchRadius,
        );

        let bestSample = approximateSample;
        let bestScore = -Infinity;

        for (let s = searchStart; s < searchEnd; s++) {
            const current = Math.abs(monoSamples[s] ?? 0);
            const next = Math.abs(monoSamples[s + 1] ?? 0);
            const prev = Math.abs(monoSamples[s - 1] ?? 0);

            const slope = next - prev;
            const isPeak = current >= prev && current >= next;

            const frameIndex = Math.floor(s / hopSize);
            const onsetWeight =
                frameIndex >= 0 && frameIndex < onset.length
                    ? onset[frameIndex]
                    : 0;

            const proximityBonus =
                1 - (Math.abs(s - approximateSample) / searchRadius) * 0.4;

            const score =
                slope * 0.5 +
                (isPeak ? current * 0.3 : 0) +
                onsetWeight * 0.15 +
                proximityBonus * 0.05;

            if (score > bestScore) {
                bestScore = score;
                bestSample = s;
            }
        }

        refinedBeats.push(bestSample);
    }

    return refinedBeats;
};

const regularizeBeatGrid = (
    beatSamples: number[],
    estimatedPeriodSamples: number,
): { offset: number; period: number } => {
    if (beatSamples.length < 4) {
        return { offset: beatSamples[0] ?? 0, period: estimatedPeriodSamples };
    }

    const intervals: number[] = [];
    for (let i = 1; i < beatSamples.length; i++) {
        intervals.push(beatSamples[i] - beatSamples[i - 1]);
    }

    intervals.sort((a, b) => a - b);
    const q1 =
        intervals[Math.floor(intervals.length * 0.25)] ??
        estimatedPeriodSamples;
    const q3 =
        intervals[Math.floor(intervals.length * 0.75)] ??
        estimatedPeriodSamples;
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    const filteredIntervals = intervals.filter(
        (i) => i >= lowerBound && i <= upperBound,
    );

    const medianPeriod =
        filteredIntervals.length > 0
            ? filteredIntervals[Math.floor(filteredIntervals.length / 2)]
            : estimatedPeriodSamples;

    const n = beatSamples.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += beatSamples[i];
        sumXY += i * beatSamples[i];
        sumXX += i * i;
    }

    const denom = n * sumXX - sumX * sumX;
    let period = medianPeriod;
    let offset = beatSamples[0];

    if (Math.abs(denom) > 1e-8) {
        const slope = (n * sumXY - sumX * sumY) / denom;
        const intercept = (sumY - slope * sumX) / n;

        const lower = medianPeriod * 0.98;
        const upper = medianPeriod * 1.02;
        period = clamp(slope, lower, upper);
        offset = wrap(intercept, period);
    }

    while (offset > period) {
        offset -= period;
    }
    while (offset < 0) {
        offset += period;
    }

    return { offset, period };
};

const analyzeBeatGrid = (
    monoSamples: Float32Array,
    sampleRate: number,
): BeatAnalysis => {
    if (monoSamples.length < sampleRate * 2) {
        return EMPTY_BEAT_ANALYSIS;
    }

    const hopSize = Math.floor(sampleRate / 200);
    const onset = computeMultiBandOnset(monoSamples, sampleRate, hopSize);

    if (onset.length < 100) {
        return EMPTY_BEAT_ANALYSIS;
    }

    const { periodFrames, confidence: tempoConfidence } = findBestTempo(
        onset,
        sampleRate,
        hopSize,
    );

    const frameRate = sampleRate / hopSize;
    let bpm = (60 * frameRate) / periodFrames;

    while (bpm < 75) bpm *= 2;
    while (bpm > 185) bpm /= 2;

    const normalizedPeriod = (60 * frameRate) / bpm;

    const beatFrames = dynamicProgrammingBeatTrack(onset, normalizedPeriod);

    if (beatFrames.length < 4) {
        return {
            bpm,
            bpmConfidence: tempoConfidence * 0.5,
            beatOffset: 0,
            beatsPerBar: 4,
        };
    }

    const beatSamples = refineBeatsToSamples(
        beatFrames,
        onset,
        monoSamples,
        hopSize,
    );

    const estimatedPeriodSamples = (sampleRate * 60) / bpm;
    const { offset, period } = regularizeBeatGrid(
        beatSamples,
        estimatedPeriodSamples,
    );

    bpm = (sampleRate * 60) / period;
    while (bpm < 75) bpm *= 2;
    while (bpm > 185) bpm /= 2;

    const finalPeriod = (sampleRate * 60) / bpm;
    const finalOffset = wrap(offset, finalPeriod);

    let alignmentScore = 0;
    let alignmentCount = 0;
    for (
        let beatSample = finalOffset;
        beatSample < monoSamples.length;
        beatSample += finalPeriod
    ) {
        const frameIdx = Math.floor(beatSample / hopSize);
        if (frameIdx >= 0 && frameIdx < onset.length) {
            alignmentScore += onset[frameIdx];
            alignmentCount++;
        }
    }

    const avgAlignment =
        alignmentCount > 0 ? alignmentScore / alignmentCount : 0;
    const alignmentConfidence = clamp01(avgAlignment / 3);

    const confidence = clamp01(
        tempoConfidence * 0.5 + alignmentConfidence * 0.5,
    );

    return {
        bpm,
        bpmConfidence: confidence,
        beatOffset: finalOffset / sampleRate,
        beatsPerBar: 4,
    };
};

const analyzeWaveformFromPcm = (
    monoSamples: Float32Array,
    sampleRate: number,
    resolution: number,
    token: number,
    canceledTokens: Set<number>,
    onProgress: (progress: number) => void,
): WaveformPayload => {
    const samples = Math.min(resolution, monoSamples.length);
    const peaks = new Float32Array(samples);
    const bands = new Float32Array(samples * 3);
    const lowRaw = new Float32Array(samples);
    const midRaw = new Float32Array(samples);
    const highRaw = new Float32Array(samples);
    const blockSize = Math.max(1, Math.floor(monoSamples.length / samples));
    const fftSize = 64;

    for (let i = 0; i < samples; i += 1) {
        if (i % 256 === 0) {
            throwIfCanceled(token, canceledTokens);
            onProgress(i / samples);
        }

        const start = i * blockSize;
        const end = Math.min(start + blockSize, monoSamples.length);
        const step = Math.max(1, Math.floor((end - start) / 128));
        let max = 0;

        for (let sampleIndex = start; sampleIndex < end; sampleIndex += step) {
            const amplitude = Math.abs(monoSamples[sampleIndex] ?? 0);
            if (amplitude > max) {
                max = amplitude;
            }
        }

        peaks[i] = max;

        const frame = new Float32Array(fftSize);
        const frameStride = Math.max(1, Math.floor((end - start) / fftSize));
        const frameCenter = Math.floor((start + end) / 2);
        const frameStart = Math.max(
            0,
            frameCenter - Math.floor((fftSize * frameStride) / 2),
        );

        for (let n = 0; n < fftSize; n += 1) {
            const sourceIndex = Math.min(
                monoSamples.length - 1,
                frameStart + n * frameStride,
            );
            const window =
                0.5 * (1 - Math.cos((2 * Math.PI * n) / (fftSize - 1)));
            frame[n] = (monoSamples[sourceIndex] ?? 0) * window;
        }

        const effectiveRate = sampleRate / frameStride;
        const [low, mid, high] = analyzeBands(frame, effectiveRate);
        lowRaw[i] = low;
        midRaw[i] = mid;
        highRaw[i] = high;
    }

    const lowNorm = normalizeBand(lowRaw);
    const midNorm = normalizeBand(midRaw);
    const highNorm = normalizeBand(highRaw);

    for (let i = 0; i < samples; i += 1) {
        const low = lowNorm[i] ** 1.45;
        const mid = midNorm[i] ** 1.45;
        const high = highNorm[i] ** 1.45;
        const denom = low + mid + high + 1e-6;
        const base = i * 3;
        bands[base] = clamp01(low / denom);
        bands[base + 1] = clamp01(mid / denom);
        bands[base + 2] = clamp01(high / denom);
    }

    const beatAnalysis = analyzeBeatGrid(monoSamples, sampleRate);
    onProgress(1);

    return {
        peaks: Array.from(peaks),
        bands: Array.from(bands),
        bpm: beatAnalysis.bpm,
        bpmConfidence: beatAnalysis.bpmConfidence,
        beatOffset: beatAnalysis.beatOffset,
        beatsPerBar: beatAnalysis.beatsPerBar,
    };
};

export const analyzeWaveform = async ({
    filePath,
    resolution,
    token,
    canceledTokens,
    onProgress,
}: AnalyzeWaveformInput): Promise<WaveformPayload> => {
    throwIfCanceled(token, canceledTokens);
    onProgress("probe", 0.25);
    const { sampleRate, samples } = await decodeMonoPcm(filePath);
    throwIfCanceled(token, canceledTokens);
    onProgress("decode", 1);

    const analyzed = analyzeWaveformFromPcm(
        samples,
        sampleRate,
        resolution,
        token,
        canceledTokens,
        (progress) => onProgress("analyze", progress),
    );

    throwIfCanceled(token, canceledTokens);
    return analyzed;
};
