import { formatTime } from "../../utils/format";
import {
    bandColor,
    getPercentileNormalizer,
    isMultipleOf,
    pickTimelineStep,
    smoothWavePoint,
} from "./math";

export type WaveViewportMetrics = {
    stableViewportStart: number;
    stableViewportEnd: number;
    width: number;
    height: number;
    dpr: number;
    visibleDuration: number;
};

type TimelineMode = "time" | "beats";

type BeatGrid = {
    bpm: number;
    beatOffset: number;
    beatsPerBar: number;
};

type Size = {
    width: number;
    height: number;
    dpr: number;
};

export const resizeCanvasIfNeeded = (
    canvas: HTMLCanvasElement,
    overlay: HTMLCanvasElement,
    previousSize: Size | null,
): Size => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    const sizeChanged =
        !previousSize ||
        previousSize.width !== width ||
        previousSize.height !== height ||
        previousSize.dpr !== dpr;

    if (sizeChanged) {
        const deviceWidth = Math.floor(width * dpr);
        const deviceHeight = Math.floor(height * dpr);
        canvas.width = deviceWidth;
        canvas.height = deviceHeight;
        overlay.width = deviceWidth;
        overlay.height = deviceHeight;
    }

    return { width, height, dpr };
};

export const drawWaveformBase = ({
    ctx,
    duration,
    peaks,
    bands,
    timelineMode,
    beatGrid,
    viewportStart,
    visibleDuration,
    width,
    height,
    dpr,
}: {
    ctx: CanvasRenderingContext2D;
    duration: number;
    peaks: Float32Array;
    bands: Float32Array;
    timelineMode: TimelineMode;
    beatGrid: BeatGrid | null;
    viewportStart: number;
    visibleDuration: number;
    width: number;
    height: number;
    dpr: number;
}): WaveViewportMetrics => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#05141f";
    ctx.fillRect(0, 0, width, height);

    const secondsPerPixel = visibleDuration / Math.max(1, width);
    const stableViewportStart =
        Math.round(viewportStart / secondsPerPixel) * secondsPerPixel;
    const stableViewportEnd = stableViewportStart + visibleDuration;

    const viewportNorm = getPercentileNormalizer(peaks, 0, peaks.length - 1);
    const pxPerSecond = width / visibleDuration;
    const minMajorSpacingPx = 78;
    const minMinorSpacingPx = 18;
    if (timelineMode === "beats" && beatGrid && beatGrid.bpm > 0) {
        const beatDuration = 60 / beatGrid.bpm;
        const pxPerBeat = pxPerSecond * beatDuration;
        const beatStrideCandidates = [1, 2, 4, 8, 16, 32];
        const beatStride =
            beatStrideCandidates.find(
                (candidate) => candidate * pxPerBeat >= minMinorSpacingPx,
            ) ?? 32;

        const beatsPerBar = Math.max(1, Math.round(beatGrid.beatsPerBar));
        const barStride = Math.max(
            1,
            Math.ceil(minMajorSpacingPx / Math.max(1, pxPerBeat * beatsPerBar)),
        );
        const majorStrideBeats = beatsPerBar * barStride;
        const firstBeat = Math.floor(
            (stableViewportStart - beatGrid.beatOffset) / beatDuration,
        );
        const lastBeat = Math.ceil(
            (stableViewportEnd - beatGrid.beatOffset) / beatDuration,
        );
        const firstMinorBeat = Math.floor(firstBeat / beatStride) * beatStride;
        const firstMajorBeat =
            Math.floor(firstBeat / majorStrideBeats) * majorStrideBeats;
        const showEveryBeatLabel = beatStride === 1 && pxPerBeat >= 26;
        const minorLabelCandidates: Array<{ x: number; label: string }> = [];
        const majorLabelRanges: Array<{ start: number; end: number }> = [];

        for (
            let beatIndex = firstMinorBeat;
            beatIndex <= lastBeat;
            beatIndex += beatStride
        ) {
            const markerTime = beatGrid.beatOffset + beatIndex * beatDuration;
            const x = (markerTime - stableViewportStart) * pxPerSecond;
            if (x < -1 || x > width + 1) {
                continue;
            }

            const alignedX = Math.round(x) + 0.5;
            ctx.strokeStyle = "rgba(132, 177, 207, 0.14)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(alignedX, 0);
            ctx.lineTo(alignedX, height);
            ctx.stroke();

            if (showEveryBeatLabel && beatIndex >= 0) {
                const beatInBar = (beatIndex % beatsPerBar) + 1;
                if (beatInBar > 1) {
                    const barNumber = Math.floor(beatIndex / beatsPerBar) + 1;
                    minorLabelCandidates.push({
                        x: alignedX,
                        label: `${barNumber}.${beatInBar}`,
                    });
                }
            }
        }

        let lastMajorLabelRight = -Infinity;
        for (
            let beatIndex = firstMajorBeat;
            beatIndex <= lastBeat;
            beatIndex += majorStrideBeats
        ) {
            const markerTime = beatGrid.beatOffset + beatIndex * beatDuration;
            const x = (markerTime - stableViewportStart) * pxPerSecond;
            if (x < -1 || x > width + 1) {
                continue;
            }

            const alignedX = Math.round(x) + 0.5;
            ctx.strokeStyle = "rgba(132, 177, 207, 0.3)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(alignedX, 0);
            ctx.lineTo(alignedX, height);
            ctx.stroke();

            const barNumber = Math.floor(beatIndex / beatsPerBar) + 1;
            if (barNumber > 0) {
                ctx.fillStyle = "rgba(195, 221, 238, 0.55)";
                ctx.font = "11px IBM Plex Sans";
                const majorLabel = showEveryBeatLabel
                    ? `${barNumber}.1`
                    : `${barNumber}`;
                const labelX = alignedX + 4;
                const labelWidth = ctx.measureText(majorLabel).width;
                const labelRight = labelX + labelWidth;
                if (labelX > lastMajorLabelRight + 6) {
                    ctx.fillText(majorLabel, labelX, 14);
                    lastMajorLabelRight = labelRight;
                    majorLabelRanges.push({
                        start: labelX - 2,
                        end: labelRight + 2,
                    });
                }
            }
        }

        if (showEveryBeatLabel) {
            ctx.fillStyle = "rgba(195, 221, 238, 0.45)";
            ctx.font = "10px IBM Plex Sans";
            let lastMinorLabelRight = -Infinity;
            for (const candidate of minorLabelCandidates) {
                const labelX = candidate.x + 3;
                const labelWidth = ctx.measureText(candidate.label).width;
                const labelRight = labelX + labelWidth;
                if (labelX <= lastMinorLabelRight + 5) {
                    continue;
                }

                const overlapsMajor = majorLabelRanges.some(
                    (range) => labelX < range.end && labelRight > range.start,
                );
                if (overlapsMajor) {
                    continue;
                }

                ctx.fillText(candidate.label, labelX, 13);
                lastMinorLabelRight = labelRight;
            }
        }
    } else {
        const majorStep = pickTimelineStep(
            Math.max(
                1,
                (visibleDuration * minMajorSpacingPx) / Math.max(1, width),
            ),
        );

        const minorStepCandidates = [5, 4, 3, 2].map(
            (divisor) => majorStep / divisor,
        );
        let minorStep = majorStep;
        for (const candidate of minorStepCandidates) {
            if (candidate * pxPerSecond >= minMinorSpacingPx) {
                minorStep = candidate;
                break;
            }
        }

        const firstMarkerIndex = Math.floor(stableViewportStart / minorStep);
        const lastMarkerIndex = Math.ceil(stableViewportEnd / minorStep);

        for (
            let markerIndex = firstMarkerIndex;
            markerIndex <= lastMarkerIndex;
            markerIndex += 1
        ) {
            const markerTime = markerIndex * minorStep;
            const x = (markerTime - stableViewportStart) * pxPerSecond;
            if (x < -1 || x > width + 1) {
                continue;
            }

            const major = isMultipleOf(markerTime, majorStep);
            const alignedX = Math.round(x) + 0.5;
            ctx.strokeStyle = major
                ? "rgba(132, 177, 207, 0.28)"
                : "rgba(132, 177, 207, 0.12)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(alignedX, 0);
            ctx.lineTo(alignedX, height);
            ctx.stroke();

            if (major) {
                ctx.fillStyle = "rgba(195, 221, 238, 0.55)";
                ctx.font = "11px IBM Plex Sans";
                ctx.fillText(formatTime(markerTime), alignedX + 4, 14);
            }
        }
    }

    const midpoint = height / 2;

    for (let x = 0; x < width; x += 1) {
        const timeAtX = stableViewportStart + (x + 0.5) * secondsPerPixel;
        const smooth = smoothWavePoint(
            timeAtX,
            secondsPerPixel,
            duration,
            peaks,
            bands,
        );

        const normalizedAmp = Math.min(
            1,
            Math.max(
                0,
                (smooth.amp - viewportNorm.low) /
                    (viewportNorm.high - viewportNorm.low),
            ),
        );
        const compressed = Math.log1p(normalizedAmp * 4.8) / Math.log1p(4.8);
        const detailedAmp = compressed ** 0.76;
        const sharpenedAmp = Math.min(
            1,
            detailedAmp * 0.96 + normalizedAmp * 0.12,
        );
        const scaledAmp = Math.max(1, sharpenedAmp * (height * 0.48));

        ctx.strokeStyle = bandColor(
            smooth.low,
            smooth.mid,
            smooth.high,
            sharpenedAmp,
        );
        ctx.globalAlpha = 0.72;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, midpoint - scaledAmp / 2);
        ctx.lineTo(x + 0.5, midpoint + scaledAmp / 2);
        ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(123, 178, 214, 0.3)";
    ctx.beginPath();
    ctx.moveTo(0, midpoint + 0.5);
    ctx.lineTo(width, midpoint + 0.5);
    ctx.stroke();

    return {
        stableViewportStart,
        stableViewportEnd,
        width,
        height,
        dpr,
        visibleDuration,
    };
};

export const drawWaveformOverlay = ({
    ctx,
    metrics,
    currentTime,
    cuePoint,
}: {
    ctx: CanvasRenderingContext2D;
    metrics: WaveViewportMetrics;
    currentTime: number;
    cuePoint: number | null;
}) => {
    const {
        width,
        height,
        dpr,
        stableViewportStart,
        stableViewportEnd,
        visibleDuration,
    } = metrics;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const playedWidth =
        ((currentTime - stableViewportStart) / visibleDuration) * width;
    if (playedWidth > 0) {
        ctx.fillStyle = "rgba(11, 31, 46, 0.4)";
        ctx.fillRect(0, 0, Math.min(width, playedWidth), height);
    }

    const playheadX =
        ((currentTime - stableViewportStart) / visibleDuration) * width;
    if (playheadX >= 0 && playheadX <= width) {
        ctx.strokeStyle = "#ffd260";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, height);
        ctx.stroke();
    }

    if (
        cuePoint !== null &&
        cuePoint >= stableViewportStart &&
        cuePoint <= stableViewportEnd
    ) {
        const cueX =
            ((cuePoint - stableViewportStart) / visibleDuration) * width;
        ctx.strokeStyle = "#ff7d6b";
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(cueX, 0);
        ctx.lineTo(cueX, height);
        ctx.stroke();
        ctx.setLineDash([]);
    }
};

export const drawOverviewBase = ({
    ctx,
    duration,
    peaks,
    bands,
    width,
    height,
    dpr,
}: {
    ctx: CanvasRenderingContext2D;
    duration: number;
    peaks: Float32Array;
    bands: Float32Array;
    width: number;
    height: number;
    dpr: number;
}) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#03101a";
    ctx.fillRect(0, 0, width, height);

    const midpoint = height / 2;
    const secondsPerPixel = duration / Math.max(1, width);
    const globalNorm = getPercentileNormalizer(peaks, 0, peaks.length - 1);

    for (let x = 0; x < width; x += 1) {
        const timeAtX = (x + 0.5) * secondsPerPixel;
        const smooth = smoothWavePoint(
            timeAtX,
            secondsPerPixel,
            duration,
            peaks,
            bands,
        );

        const normalizedAmp = Math.min(
            1,
            Math.max(
                0,
                (smooth.amp - globalNorm.low) /
                    (globalNorm.high - globalNorm.low),
            ),
        );
        const compressed = Math.log1p(normalizedAmp * 4.2) / Math.log1p(4.2);
        const sharpenedAmp = compressed ** 0.78;
        const scaledAmp = Math.max(1, sharpenedAmp * (height * 0.9));

        ctx.strokeStyle = bandColor(
            smooth.low,
            smooth.mid,
            smooth.high,
            sharpenedAmp,
        );
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, midpoint - scaledAmp / 2);
        ctx.lineTo(x + 0.5, midpoint + scaledAmp / 2);
        ctx.stroke();
    }

    ctx.globalAlpha = 1;
};

export const drawOverviewOverlay = ({
    ctx,
    width,
    height,
    dpr,
    duration,
    currentTime,
    visibleDuration,
    viewportStart,
}: {
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    dpr: number;
    duration: number;
    currentTime: number;
    visibleDuration: number;
    viewportStart: number;
}) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const viewWidth = visibleDuration
        ? (visibleDuration / duration) * width
        : width;
    const viewX = (viewportStart / duration) * width;
    ctx.strokeStyle = "#ffd260";
    ctx.lineWidth = 2;
    ctx.strokeRect(viewX, 1, Math.max(2, viewWidth), height - 2);

    const playheadX = (currentTime / duration) * width;
    if (playheadX >= 0 && playheadX <= width) {
        ctx.strokeStyle = "#ffd260";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, height);
        ctx.stroke();
    }
};
