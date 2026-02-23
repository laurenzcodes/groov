import {
    type PointerEvent,
    useEffect,
    useRef,
    useState,
    type WheelEvent,
} from "react";
import { useDeckContext } from "../context/DeckContext";
import { formatTimeDetailed } from "../utils/format";
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
        const waveformZone = waveformCanvasRef.current?.closest(
            '[data-waveform-zone="true"]',
        );
        const overviewZone = overviewCanvasRef.current?.closest(
            '[data-overview-strip="true"]',
        );

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
        <section className="relative z-10 flex min-h-0 flex-col gap-2 p-2">
            <div className="flex flex-wrap items-center gap-2 rounded border border-slate-700 bg-slate-900 px-3 py-2">
                <h2 className="min-w-0 flex-1 truncate font-display text-base uppercase tracking-[0.08em] text-slate-100">
                    {trackInfo?.name ?? "Waveform Preview"}
                </h2>
                <div className="flex items-baseline gap-2 font-mono">
                    <strong className="text-base tabular-nums text-slate-100 md:text-lg">
                        {formatTimeDetailed(currentTime)}
                    </strong>
                    <span className="text-xs tabular-nums text-slate-400 md:text-sm">
                        / {formatTimeDetailed(duration)}
                    </span>
                </div>
                <div
                    className="ml-auto inline-flex overflow-hidden rounded border border-slate-600"
                    role="radiogroup"
                >
                    <button
                        type="button"
                        className={`min-w-24 border-r border-slate-600 px-3 py-1.5 font-mono text-[0.64rem] uppercase tracking-[0.1em] transition ${
                            timelineMode === "time"
                                ? "bg-slate-700 text-slate-100"
                                : "bg-slate-900 text-slate-300 hover:bg-slate-800"
                        }`}
                        onClick={() => setTimelineMode("time")}
                        aria-pressed={timelineMode === "time"}
                    >
                        Time
                    </button>
                    <button
                        type="button"
                        className={`min-w-24 px-3 py-1.5 font-mono text-[0.64rem] uppercase tracking-[0.1em] transition ${
                            timelineMode === "beats"
                                ? "bg-slate-700 text-slate-100"
                                : "bg-slate-900 text-slate-300 hover:bg-slate-800"
                        }`}
                        onClick={() => setTimelineMode("beats")}
                        aria-pressed={timelineMode === "beats"}
                        disabled={!beatMetrics}
                    >
                        Beats/Bars
                    </button>
                </div>
            </div>

            <div
                data-waveform-zone="true"
                className="relative flex-[0_1_clamp(210px,44vh,360px)] overflow-hidden rounded border border-slate-700 bg-slate-950"
                onPointerDown={onWavePointerDown}
                onPointerMove={onWavePointerMove}
                onPointerUp={onWavePointerUp}
            >
                <canvas ref={waveformCanvasRef} className="block h-full w-full" />
                <canvas
                    ref={waveformOverlayCanvasRef}
                    className="pointer-events-none absolute inset-0 block h-full w-full"
                />
                {!hasTrackLoaded ? (
                    <div className="absolute inset-0 grid place-items-center bg-slate-950/75 px-4 text-center text-sm text-slate-400">
                        Load a track to render a high-resolution waveform.
                    </div>
                ) : null}
            </div>

            <div
                data-overview-strip="true"
                className="relative h-9 overflow-hidden rounded border border-slate-700 bg-slate-950"
                onPointerDown={onOverviewPointerDown}
                onPointerMove={onOverviewPointerMove}
                onPointerUp={onOverviewPointerUp}
                onWheel={onOverviewWheel}
            >
                <canvas ref={overviewCanvasRef} className="block h-full w-full" />
                <canvas
                    ref={overviewOverlayCanvasRef}
                    className="pointer-events-none absolute inset-0 block h-full w-full"
                />
            </div>
        </section>
    );
}
