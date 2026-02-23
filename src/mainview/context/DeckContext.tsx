import { createContext, type ReactNode, useContext } from "react";
import type { TimelineMode, TrackInfo, WaveformData } from "../types";

export type DeckHistoryEntry = {
    id: string;
    name: string;
    duration: number;
};

type AnalysisAction = "open" | "history" | "reanalyze" | "drop" | null;

type DeckContextValue = {
    trackInfo: TrackInfo | null;
    waveformData: WaveformData | null;
    duration: number;
    currentTime: number;
    visibleDuration: number;
    viewportStart: number;
    cuePoint: number | null;
    isScrubbing: boolean;
    hasTrackLoaded: boolean;
    isDecoding: boolean;
    isPlaying: boolean;
    volume: number;
    error: string | null;
    analysisLabel: string;
    analysisAction: AnalysisAction;
    beatJumpSeconds: number | null;
    barJumpSeconds: number | null;
    trackHistory: DeckHistoryEntry[];
    activeTrackHistoryId: string | null;
    timelineMode: TimelineMode;
    openFilePicker: () => Promise<void>;
    togglePlayback: () => Promise<void>;
    skipBy: (delta: number) => void;
    setCue: () => void;
    jumpToCue: () => void;
    setVolume: (value: number) => void;
    loadTrackFromHistory: (historyId: string) => Promise<void>;
    removeTrackFromHistory: (historyId: string) => Promise<void>;
    reanalyzeCurrentTrack: () => Promise<void>;
    setTimelineMode: (mode: TimelineMode) => void;
    onScrubStart: (ratio: number) => void;
    onScrubMove: (deltaRatio: number) => void;
    onScrubEnd: () => void;
    onOverviewDragStart: (ratio: number) => void;
    onOverviewDragMove: (ratio: number) => void;
    onOverviewDragEnd: () => void;
    onMinimapZoomDelta: (deltaY: number) => void;
};

const DeckContext = createContext<DeckContextValue | null>(null);

export function DeckContextProvider({
    value,
    children,
}: {
    value: DeckContextValue;
    children: ReactNode;
}) {
    return (
        <DeckContext.Provider value={value}>{children}</DeckContext.Provider>
    );
}

export function useDeckContext() {
    const context = useContext(DeckContext);
    if (!context) {
        throw new Error(
            "useDeckContext must be used within DeckContextProvider",
        );
    }
    return context;
}
