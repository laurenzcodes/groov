import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SelectedTrackPayload } from "../shared/rpc";
import { AppFooter } from "./components/AppFooter";
import { LeftPanel } from "./components/LeftPanel";
import { TopBar } from "./components/TopBar";
import { WavePanel } from "./components/WavePanel";
import { DeckContextProvider } from "./context/DeckContext";
import { useAudioPlayback } from "./hooks/useAudioPlayback";
import { groovRpc, onAnalysisProgress } from "./rpc";
import type { TimelineMode, TrackInfo, WaveformData } from "./types";
import {
    base64ToArrayBuffer,
    HISTORY_MAX_ITEMS,
    MAX_TRACK_CACHE_ITEMS,
    WAVEFORM_RESOLUTION,
    waveformFromPayload,
} from "./utils/audioData";
import {
    buildHistoryEntry,
    mapHistoryEntryToItem,
    type TrackHistoryItem,
} from "./utils/trackHistory";

type DecodedTrackCacheItem = {
    id: string;
    path: string;
    type: string;
    trackInfo: TrackInfo;
    audioBuffer: AudioBuffer;
    waveformData: WaveformData;
};

function App() {
    const {
        audioBuffer,
        setAudioBuffer,
        currentTime,
        setCurrentTime,
        isPlaying,
        volume,
        setOutputVolume,
        startOffsetRef,
        getPlaybackTime,
        startPlayback,
        pausePlayback,
        seekTo,
    } = useAudioPlayback(1);

    const scrubWasPlayingRef = useRef(false);
    const overviewWasPlayingRef = useRef(false);
    const decodeTokenRef = useRef(0);
    const decodedTrackCacheRef = useRef(
        new Map<string, DecodedTrackCacheItem>(),
    );

    const [waveformData, setWaveformData] = useState<WaveformData | null>(null);
    const [trackInfo, setTrackInfo] = useState<TrackInfo | null>(null);
    const [isDecoding, setIsDecoding] = useState(false);
    const [isScrubbing, setIsScrubbing] = useState(false);
    const [zoom, setZoom] = useState(4);
    const [cuePoint, setCuePoint] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [analysisLabel, setAnalysisLabel] = useState("Ready");
    const [analysisAction, setAnalysisAction] = useState<
        "open" | "history" | "reanalyze" | null
    >(null);
    const [trackHistory, setTrackHistory] = useState<TrackHistoryItem[]>([]);
    const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
    const [timelineMode, setTimelineMode] = useState<TimelineMode>("time");

    const duration = audioBuffer?.duration ?? 0;
    const hasTrackLoaded = Boolean(audioBuffer);

    const refreshHistory = useCallback(async () => {
        const storedHistory = await groovRpc.request.listTrackHistory({});
        setTrackHistory(storedHistory.map(mapHistoryEntryToItem));
    }, []);

    useEffect(() => {
        void refreshHistory();
    }, [refreshHistory]);

    useEffect(() => {
        return onAnalysisProgress((event) => {
            if (event.token !== decodeTokenRef.current) {
                return;
            }

            const progressPct = Math.round(event.progress * 100);
            const stageLabel =
                event.stage === "cache"
                    ? "Cache"
                    : event.stage === "probe"
                      ? "Inspect"
                      : event.stage === "decode"
                        ? "Decode"
                        : "Analyze";

            setAnalysisLabel(`${stageLabel} ${progressPct}%`);
        });
    }, []);

    const visibleDuration = useMemo(() => {
        if (!duration) {
            return 0;
        }
        return duration / Math.max(1, zoom);
    }, [duration, zoom]);

    const viewportStart = useMemo(() => {
        if (!duration || !visibleDuration) {
            return 0;
        }

        const maxStart = Math.max(0, duration - visibleDuration);
        const centeredStart = currentTime - visibleDuration * 0.5;
        return Math.min(Math.max(0, centeredStart), maxStart);
    }, [currentTime, duration, visibleDuration]);

    const getCachedTrack = useCallback(
        (id: string): DecodedTrackCacheItem | null => {
            const cache = decodedTrackCacheRef.current;
            const cached = cache.get(id);
            if (!cached) {
                return null;
            }

            cache.delete(id);
            cache.set(id, cached);
            return cached;
        },
        [],
    );

    const storeCachedTrack = useCallback((item: DecodedTrackCacheItem) => {
        const cache = decodedTrackCacheRef.current;
        cache.delete(item.id);
        cache.set(item.id, item);

        while (cache.size > MAX_TRACK_CACHE_ITEMS) {
            const oldestId = cache.keys().next().value;
            if (!oldestId) {
                break;
            }
            cache.delete(oldestId);
        }
    }, []);

    const applyLoadedTrack = useCallback(
        (
            id: string,
            info: TrackInfo,
            decodedBuffer: AudioBuffer,
            waveData: WaveformData,
        ) => {
            setAudioBuffer(decodedBuffer);
            setWaveformData(waveData);
            setTrackInfo(info);
            setCurrentTime(0);
            setCuePoint(null);
            setActiveHistoryId(id);
            setAnalysisLabel("Ready");
        },
        [setAudioBuffer, setCurrentTime],
    );

    const upsertHistoryRecord = useCallback(
        async (
            id: string,
            path: string,
            type: string,
            info: TrackInfo,
            trackDuration: number,
        ) => {
            const entry = buildHistoryEntry(
                id,
                path,
                type,
                info,
                trackDuration,
            );
            await groovRpc.request.upsertTrackHistory({
                entry,
                maxItems: HISTORY_MAX_ITEMS,
            });
            await refreshHistory();
        },
        [refreshHistory],
    );

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (!hasTrackLoaded || isDecoding) {
                return;
            }

            const element = event.target as HTMLElement | null;
            if (
                element?.tagName === "INPUT" ||
                element?.tagName === "TEXTAREA" ||
                element?.isContentEditable
            ) {
                return;
            }

            if (event.code === "Space") {
                event.preventDefault();
                void (async () => {
                    if (isPlaying) {
                        pausePlayback();
                    } else {
                        const nearEnd =
                            duration - startOffsetRef.current < 0.02;
                        if (nearEnd) {
                            setCurrentTime(0);
                        }
                        await startPlayback(startOffsetRef.current);
                    }
                })();
            }

            if (event.code === "ArrowLeft") {
                event.preventDefault();
                seekTo(getPlaybackTime() - (event.shiftKey ? 10 : 1));
            }

            if (event.code === "ArrowRight") {
                event.preventDefault();
                seekTo(getPlaybackTime() + (event.shiftKey ? 10 : 1));
            }

            if (event.code === "KeyC") {
                event.preventDefault();
                setCuePoint(getPlaybackTime());
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [
        duration,
        getPlaybackTime,
        hasTrackLoaded,
        isDecoding,
        isPlaying,
        pausePlayback,
        seekTo,
        setCurrentTime,
        startOffsetRef,
        startPlayback,
    ]);

    const loadTrackPayload = useCallback(
        async (
            payload: SelectedTrackPayload,
            options?: {
                forceReanalyze?: boolean;
                source?: "open" | "history" | "reanalyze";
            },
        ) => {
            const previousToken = decodeTokenRef.current;
            if (previousToken > 0) {
                void groovRpc.request.cancelWaveformAnalysis({
                    token: previousToken,
                });
            }

            const decodeToken = previousToken + 1;
            decodeTokenRef.current = decodeToken;
            setError(null);
            pausePlayback();

            const shouldForceReanalyze = options?.forceReanalyze === true;
            setAnalysisAction(options?.source ?? null);
            const cached = shouldForceReanalyze ? null : getCachedTrack(payload.id);
            if (cached) {
                applyLoadedTrack(
                    payload.id,
                    cached.trackInfo,
                    cached.audioBuffer,
                    cached.waveformData,
                );
                setIsDecoding(false);
                await upsertHistoryRecord(
                    payload.id,
                    cached.path,
                    cached.type,
                    cached.trackInfo,
                    cached.audioBuffer.duration,
                );
                setAnalysisAction(null);
                return;
            }

            setIsDecoding(true);
            setWaveformData(null);
            setAnalysisLabel("Preparing 0%");

            try {
                const context = new AudioContext({
                    latencyHint: "interactive",
                });
                let decodedBuffer: AudioBuffer;
                let waveformPayload: Awaited<
                    ReturnType<typeof groovRpc.request.analyzeWaveform>
                >;
                try {
                    const audioData = base64ToArrayBuffer(payload.audioBase64);
                    const analysisKey = shouldForceReanalyze
                        ? `v6:${payload.id}:${WAVEFORM_RESOLUTION}:force:${decodeToken}`
                        : `v6:${payload.id}:${WAVEFORM_RESOLUTION}`;

                    const decodePromise = context.decodeAudioData(
                        audioData.slice(0),
                    );
                    const waveformPromise = groovRpc.request.analyzeWaveform({
                        analysisKey,
                        filePath: payload.path,
                        resolution: WAVEFORM_RESOLUTION,
                        token: decodeToken,
                    });

                    [decodedBuffer, waveformPayload] = await Promise.all([
                        decodePromise,
                        waveformPromise,
                    ]);
                } finally {
                    void context.close();
                }

                if (decodeTokenRef.current !== decodeToken) {
                    return;
                }

                const nextTrackInfo: TrackInfo = {
                    name: payload.name,
                    type: payload.type,
                    size: payload.size,
                    sampleRate: decodedBuffer.sampleRate,
                    channels: decodedBuffer.numberOfChannels,
                };

                const nextWaveformData = waveformFromPayload(waveformPayload);
                applyLoadedTrack(
                    payload.id,
                    nextTrackInfo,
                    decodedBuffer,
                    nextWaveformData,
                );

                storeCachedTrack({
                    id: payload.id,
                    path: payload.path,
                    type: payload.type,
                    trackInfo: nextTrackInfo,
                    audioBuffer: decodedBuffer,
                    waveformData: nextWaveformData,
                });

                await upsertHistoryRecord(
                    payload.id,
                    payload.path,
                    payload.type,
                    nextTrackInfo,
                    decodedBuffer.duration,
                );
            } catch {
                if (decodeTokenRef.current !== decodeToken) {
                    return;
                }

                setAudioBuffer(null);
                setWaveformData(null);
                setTrackInfo(null);
                setCurrentTime(0);
                setCuePoint(null);
                setError("Could not decode this audio file.");
                setAnalysisLabel("Failed");
            } finally {
                if (decodeTokenRef.current === decodeToken) {
                    setIsDecoding(false);
                    setAnalysisAction(null);
                }
            }
        },
        [
            applyLoadedTrack,
            getCachedTrack,
            pausePlayback,
            setAudioBuffer,
            setCurrentTime,
            storeCachedTrack,
            upsertHistoryRecord,
        ],
    );

    const openFilePicker = useCallback(async () => {
        if (isDecoding) {
            return;
        }

        const payload = await groovRpc.request.pickTrack({});
        if (!payload) {
            return;
        }

        await loadTrackPayload(payload, { source: "open" });
    }, [isDecoding, loadTrackPayload]);

    const togglePlayback = useCallback(async () => {
        if (!hasTrackLoaded || isDecoding) {
            return;
        }

        if (isPlaying) {
            pausePlayback();
            return;
        }

        try {
            const nearEnd = duration - startOffsetRef.current < 0.02;
            const startAt = nearEnd ? 0 : startOffsetRef.current;
            setCurrentTime(startAt);
            await startPlayback(startAt);
            setError(null);
        } catch {
            setError("Playback was blocked. Try pressing play again.");
        }
    }, [
        hasTrackLoaded,
        isDecoding,
        isPlaying,
        pausePlayback,
        duration,
        setCurrentTime,
        startPlayback,
        startOffsetRef.current,
    ]);

    const skipBy = useCallback(
        (delta: number) => {
            seekTo(getPlaybackTime() + delta);
        },
        [seekTo, getPlaybackTime],
    );

    const beatJumpSeconds =
        waveformData?.bpm !== null &&
        waveformData?.bpm !== undefined &&
        waveformData.bpm > 0
            ? 60 / waveformData.bpm
            : null;
    const barJumpSeconds =
        beatJumpSeconds !== null && waveformData
            ? beatJumpSeconds *
              Math.max(1, Math.round(waveformData.beatsPerBar))
            : null;

    const setCue = useCallback(() => {
        if (!hasTrackLoaded) {
            return;
        }
        setCuePoint(getPlaybackTime());
    }, [hasTrackLoaded, getPlaybackTime]);

    const jumpToCue = useCallback(() => {
        if (cuePoint === null) {
            return;
        }
        seekTo(cuePoint);
    }, [cuePoint, seekTo]);

    const getTimeFromWaveRatio = useCallback(
        (ratio: number) => {
            if (!duration || !visibleDuration) {
                return 0;
            }
            return viewportStart + ratio * visibleDuration;
        },
        [duration, visibleDuration, viewportStart],
    );

    const onScrubStart = useCallback(
        (ratio: number) => {
            if (!hasTrackLoaded || isDecoding) {
                return;
            }

            scrubWasPlayingRef.current = isPlaying;
            if (isPlaying) {
                pausePlayback();
            }

            setIsScrubbing(true);
            setCurrentTime(getTimeFromWaveRatio(ratio));
        },
        [
            hasTrackLoaded,
            isDecoding,
            isPlaying,
            pausePlayback,
            getTimeFromWaveRatio,
            setCurrentTime,
        ],
    );

    const onScrubMove = useCallback(
        (deltaRatio: number) => {
            if (!isScrubbing || !hasTrackLoaded || isDecoding) {
                return;
            }

            const magnitude = Math.abs(deltaRatio);
            const direction = Math.sign(deltaRatio);
            const acceleration =
                0.2 + Math.min(3.5, Math.min(1, magnitude * 18) ** 1.15 * 3.3);
            const deltaSeconds =
                direction * visibleDuration * magnitude * acceleration;
            const nextTime = Math.min(
                duration,
                Math.max(0, startOffsetRef.current + deltaSeconds),
            );
            setCurrentTime(nextTime);
        },
        [
            isScrubbing,
            hasTrackLoaded,
            isDecoding,
            visibleDuration,
            duration,
            setCurrentTime,
            startOffsetRef.current,
        ],
    );

    const onScrubEnd = useCallback(() => {
        if (!isScrubbing) {
            return;
        }

        setIsScrubbing(false);
        if (scrubWasPlayingRef.current) {
            void startPlayback(startOffsetRef.current);
        }
    }, [isScrubbing, startPlayback, startOffsetRef.current]);

    const onOverviewDragStart = useCallback(
        (ratio: number) => {
            if (!hasTrackLoaded || !duration || isDecoding) {
                overviewWasPlayingRef.current = false;
                return;
            }

            overviewWasPlayingRef.current = isPlaying;
            if (isPlaying) {
                pausePlayback();
            }
            const target = Math.min(duration, Math.max(0, ratio * duration));
            setCurrentTime(target);
        },
        [
            hasTrackLoaded,
            duration,
            isDecoding,
            isPlaying,
            pausePlayback,
            setCurrentTime,
        ],
    );

    const onOverviewDragMove = useCallback(
        (ratio: number) => {
            if (!hasTrackLoaded || !duration || isDecoding) {
                return;
            }
            const target = Math.min(duration, Math.max(0, ratio * duration));
            setCurrentTime(target);
        },
        [hasTrackLoaded, duration, isDecoding, setCurrentTime],
    );

    const onOverviewDragEnd = useCallback(() => {
        if (overviewWasPlayingRef.current) {
            void startPlayback(startOffsetRef.current);
        }
        overviewWasPlayingRef.current = false;
    }, [startPlayback, startOffsetRef.current]);

    const onMinimapZoomDelta = useCallback(
        (deltaY: number) => {
            if (!hasTrackLoaded) {
                return;
            }
            setZoom((previous) => {
                const zoomFactor = Math.exp(-deltaY * 0.0018);
                const next = previous * zoomFactor;
                return Math.min(14, Math.max(1, next));
            });
        },
        [hasTrackLoaded],
    );

    const loadTrackFromHistory = useCallback(
        async (historyId: string) => {
            if (isDecoding) {
                return;
            }

            setError(null);
            const cached = getCachedTrack(historyId);
            if (cached) {
                pausePlayback();
                applyLoadedTrack(
                    historyId,
                    cached.trackInfo,
                    cached.audioBuffer,
                    cached.waveformData,
                );
                await upsertHistoryRecord(
                    historyId,
                    cached.path,
                    cached.type,
                    cached.trackInfo,
                    cached.audioBuffer.duration,
                );
                return;
            }

            const payload = await groovRpc.request.loadTrackById({
                id: historyId,
            });

            if (!payload) {
                setError("Could not load this track from history.");
                return;
            }

            await loadTrackPayload(payload, { source: "history" });
        },
        [
            isDecoding,
            getCachedTrack,
            pausePlayback,
            applyLoadedTrack,
            upsertHistoryRecord,
            loadTrackPayload,
        ],
    );

    const reanalyzeCurrentTrack = useCallback(async () => {
        if (isDecoding || !activeHistoryId) {
            return;
        }

        setError(null);
        const payload = await groovRpc.request.loadTrackById({
            id: activeHistoryId,
        });

        if (!payload) {
            setError("Could not reload this track for re-analysis.");
            return;
        }

        await loadTrackPayload(payload, {
            forceReanalyze: true,
            source: "reanalyze",
        });
    }, [isDecoding, activeHistoryId, loadTrackPayload]);

    const historyItems = useMemo(
        () =>
            trackHistory.map((item) => ({
                id: item.id,
                name: item.trackInfo.name,
                duration: item.duration,
            })),
        [trackHistory],
    );

    const deckContextValue = useMemo(
        () => ({
            trackInfo,
            waveformData,
            duration,
            currentTime,
            visibleDuration,
            viewportStart,
            cuePoint,
            isScrubbing,
            hasTrackLoaded,
            isDecoding,
            isPlaying,
            volume,
            error,
            analysisLabel,
            analysisAction,
            beatJumpSeconds,
            barJumpSeconds,
            trackHistory: historyItems,
            activeTrackHistoryId: activeHistoryId,
            timelineMode,
            openFilePicker,
            togglePlayback,
            skipBy,
            setCue,
            jumpToCue,
            setVolume: setOutputVolume,
            loadTrackFromHistory,
            reanalyzeCurrentTrack,
            setTimelineMode,
            onScrubStart,
            onScrubMove,
            onScrubEnd,
            onOverviewDragStart,
            onOverviewDragMove,
            onOverviewDragEnd,
            onMinimapZoomDelta,
        }),
        [
            trackInfo,
            waveformData,
            duration,
            currentTime,
            visibleDuration,
            viewportStart,
            cuePoint,
            isScrubbing,
            hasTrackLoaded,
            isDecoding,
            isPlaying,
            volume,
            error,
            analysisLabel,
            analysisAction,
            beatJumpSeconds,
            barJumpSeconds,
            historyItems,
            activeHistoryId,
            timelineMode,
            openFilePicker,
            togglePlayback,
            skipBy,
            setCue,
            jumpToCue,
            setOutputVolume,
            loadTrackFromHistory,
            reanalyzeCurrentTrack,
            onScrubStart,
            onScrubMove,
            onScrubEnd,
            onOverviewDragStart,
            onOverviewDragMove,
            onOverviewDragEnd,
            onMinimapZoomDelta,
        ],
    );

    return (
        <DeckContextProvider value={deckContextValue}>
            <div className="app-shell">
                <div className="app-frame">
                    <TopBar />
                    <div className="workspace">
                        <LeftPanel />
                        <WavePanel />
                    </div>
                    <AppFooter />
                </div>
            </div>
        </DeckContextProvider>
    );
}

export default App;
