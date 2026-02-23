import {
    type PointerEvent,
    useEffect,
    useRef,
    useState,
    type WheelEvent,
} from "react";
import { useDeckContext } from "../context/DeckContext";
import { formatTime, formatTimeDetailed } from "../utils/format";
import {
    drawOverviewBase,
    drawOverviewOverlay,
    drawWaveformBase,
    drawWaveformOverlay,
    resizeCanvasIfNeeded,
    type WaveViewportMetrics,
} from "./waveform/render";

export function WavePanel() {
    const {
        waveformData,
        duration,
        currentTime,
        visibleDuration,
        viewportStart,
        cuePoint,
        isScrubbing,
        hasTrackLoaded,
        trackInfo,
        timelineMode,
        setTimelineMode,
        onScrubStart,
        onScrubMove,
        onScrubEnd,
        onOverviewDragStart,
        onOverviewDragMove,
        onOverviewDragEnd,
        onMinimapZoomDelta,
    } = useDeckContext();

    const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const waveformOverlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const overviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const overviewOverlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const draggingRef = useRef(false);
    const overviewDraggingRef = useRef(false);
    const lastScrubRatioRef = useRef(0);
    const waveformSizeRef = useRef<{
        width: number;
        height: number;
        dpr: number;
    } | null>(null);
    const overviewSizeRef = useRef<{
        width: number;
        height: number;
        dpr: number;
    } | null>(null);
    const viewportMetricsRef = useRef<WaveViewportMetrics | null>(null);
    const [layoutRevision, setLayoutRevision] = useState(0);
    const beatMetrics =
        waveformData?.bpm === null || waveformData?.bpm === undefined
            ? null
            : {
                  bpm: waveformData.bpm,
              };

    useEffect(() => {
        const waveformZone =
            waveformCanvasRef.current?.closest(".waveform-zone");
        const overviewZone =
            overviewCanvasRef.current?.closest(".overview-strip");

        if (!waveformZone && !overviewZone) {
            return;
        }

        let rafId: number | null = null;
        const triggerRerender = () => {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }
            rafId = requestAnimationFrame(() => {
                setLayoutRevision((prev) => prev + 1);
            });
        };

        const observer = new ResizeObserver(() => {
            triggerRerender();
        });

        if (waveformZone) {
            observer.observe(waveformZone);
        }
        if (overviewZone) {
            observer.observe(overviewZone);
        }

        window.addEventListener("resize", triggerRerender);
        triggerRerender();

        return () => {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }
            window.removeEventListener("resize", triggerRerender);
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        void layoutRevision;
        const canvas = waveformCanvasRef.current;
        const overlay = waveformOverlayCanvasRef.current;
        if (
            !canvas ||
            !overlay ||
            !waveformData ||
            !duration ||
            !visibleDuration
        ) {
            return;
        }

        const size = resizeCanvasIfNeeded(
            canvas,
            overlay,
            waveformSizeRef.current,
        );
        waveformSizeRef.current = size;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return;
        }

        viewportMetricsRef.current = drawWaveformBase({
            ctx,
            duration,
            peaks: waveformData.peaks,
            bands: waveformData.bands,
            timelineMode,
            beatGrid:
                waveformData.bpm === null
                    ? null
                    : {
                          bpm: waveformData.bpm,
                          beatOffset: waveformData.beatOffset,
                          beatsPerBar: waveformData.beatsPerBar,
                      },
            viewportStart,
            visibleDuration,
            width: size.width,
            height: size.height,
            dpr: size.dpr,
        });
    }, [
        duration,
        waveformData,
        timelineMode,
        viewportStart,
        visibleDuration,
        layoutRevision,
    ]);

    useEffect(() => {
        void layoutRevision;
        const overlay = waveformOverlayCanvasRef.current;
        const metrics = viewportMetricsRef.current;
        if (!overlay || !metrics) {
            return;
        }

        const ctx = overlay.getContext("2d");
        if (!ctx) {
            return;
        }

        drawWaveformOverlay({
            ctx,
            metrics,
            currentTime,
            cuePoint,
        });
    }, [cuePoint, currentTime, layoutRevision]);

    useEffect(() => {
        void layoutRevision;
        const canvas = overviewCanvasRef.current;
        const overlay = overviewOverlayCanvasRef.current;
        if (!canvas || !overlay || !waveformData || !duration) {
            return;
        }

        const size = resizeCanvasIfNeeded(
            canvas,
            overlay,
            overviewSizeRef.current,
        );
        overviewSizeRef.current = size;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return;
        }

        drawOverviewBase({
            ctx,
            duration,
            peaks: waveformData.peaks,
            bands: waveformData.bands,
            width: size.width,
            height: size.height,
            dpr: size.dpr,
        });
    }, [duration, waveformData, layoutRevision]);

    useEffect(() => {
        void layoutRevision;
        const overlay = overviewOverlayCanvasRef.current;
        const size = overviewSizeRef.current;
        if (!overlay || !size || !duration) {
            return;
        }

        const ctx = overlay.getContext("2d");
        if (!ctx) {
            return;
        }

        drawOverviewOverlay({
            ctx,
            width: size.width,
            height: size.height,
            dpr: size.dpr,
            duration,
            currentTime,
            visibleDuration,
            viewportStart,
        });
    }, [currentTime, duration, layoutRevision, viewportStart, visibleDuration]);

    const toRatio = (event: PointerEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return Math.min(
            Math.max(0, (event.clientX - rect.left) / rect.width),
            1,
        );
    };

    const onWavePointerDown = (event: PointerEvent<HTMLDivElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        draggingRef.current = true;
        const ratio = toRatio(event);
        lastScrubRatioRef.current = ratio;
        onScrubStart(ratio);
    };

    const onWavePointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (!draggingRef.current) {
            return;
        }
        const ratio = toRatio(event);
        const deltaRatio = ratio - lastScrubRatioRef.current;
        lastScrubRatioRef.current = ratio;
        onScrubMove(deltaRatio);
    };

    const onWavePointerUp = (event: PointerEvent<HTMLDivElement>) => {
        if (!draggingRef.current) {
            return;
        }
        draggingRef.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
        onScrubEnd();
    };

    const onOverviewPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        overviewDraggingRef.current = true;
        onOverviewDragStart(toRatio(event));
    };

    const onOverviewPointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (!overviewDraggingRef.current) {
            return;
        }
        onOverviewDragMove(toRatio(event));
    };

    const onOverviewPointerUp = (event: PointerEvent<HTMLDivElement>) => {
        if (!overviewDraggingRef.current) {
            return;
        }
        overviewDraggingRef.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
        onOverviewDragEnd();
    };

    const onOverviewWheel = (event: WheelEvent<HTMLDivElement>) => {
        if (!event.ctrlKey) {
            return;
        }
        event.preventDefault();
        onMinimapZoomDelta(event.deltaY);
    };

    return (
        <section className="wave-panel">
            <div className="wave-header">
                <h2>{trackInfo?.name ?? "Waveform Preview"}</h2>
                <div className="time-readout">
                    <strong>{formatTimeDetailed(currentTime)}</strong>
                    <span>/ {formatTimeDetailed(duration)}</span>
                </div>
                <div className="timeline-mode-switch" role="radiogroup">
                    <button
                        type="button"
                        className={timelineMode === "time" ? "is-active" : ""}
                        onClick={() => setTimelineMode("time")}
                        aria-pressed={timelineMode === "time"}
                    >
                        Time
                    </button>
                    <button
                        type="button"
                        className={timelineMode === "beats" ? "is-active" : ""}
                        onClick={() => setTimelineMode("beats")}
                        aria-pressed={timelineMode === "beats"}
                        disabled={!beatMetrics}
                    >
                        Beats/Bars
                    </button>
                </div>
            </div>

            <div
                className="waveform-zone"
                onPointerDown={onWavePointerDown}
                onPointerMove={onWavePointerMove}
                onPointerUp={onWavePointerUp}
            >
                <canvas ref={waveformCanvasRef} className="wave-canvas" />
                <canvas
                    ref={waveformOverlayCanvasRef}
                    className="wave-canvas wave-overlay-canvas"
                />
                {!hasTrackLoaded && (
                    <div className="wave-overlay">
                        Load a track to render a high-resolution waveform.
                    </div>
                )}
            </div>

            <div
                className="overview-strip"
                onPointerDown={onOverviewPointerDown}
                onPointerMove={onOverviewPointerMove}
                onPointerUp={onOverviewPointerUp}
                onWheel={onOverviewWheel}
            >
                <canvas ref={overviewCanvasRef} className="overview-canvas" />
                <canvas
                    ref={overviewOverlayCanvasRef}
                    className="overview-canvas overview-overlay-canvas"
                />
            </div>
        </section>
    );
}
