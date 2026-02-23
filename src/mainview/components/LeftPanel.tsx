import type { CSSProperties } from "react";
import { useDeckContext } from "../context/DeckContext";
import { formatTime } from "../utils/format";

const panelClass =
    "rounded border border-slate-700 bg-slate-900 p-3";
const headingClass =
    "mb-2 font-display text-sm uppercase tracking-[0.08em] text-slate-200";
const buttonClass =
    "w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-[0.78rem] font-semibold tracking-[0.02em] text-slate-100 transition-colors hover:border-slate-500 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-45";

export function LeftPanel() {
    const {
        hasTrackLoaded,
        isDecoding,
        isPlaying,
        cuePoint,
        volume,
        error,
        analysisAction,
        beatJumpSeconds,
        barJumpSeconds,
        openFilePicker,
        togglePlayback,
        skipBy,
        setCue,
        jumpToCue,
        setVolume,
        trackHistory,
        activeTrackHistoryId,
        loadTrackFromHistory,
        removeTrackFromHistory,
        reanalyzeCurrentTrack,
    } = useDeckContext();

    return (
        <aside className="min-h-0 overflow-auto border-b border-slate-700 bg-slate-950 p-2 lg:border-b-0 lg:border-r">
            <div className="grid gap-2.5">
                <section className={panelClass}>
                    <h2 className={headingClass}>Source</h2>
                    <div className="grid gap-1.5">
                        <button
                            className={`${buttonClass} inline-flex items-center justify-center gap-2 border-cyan-600 bg-cyan-600 text-white hover:border-cyan-500 hover:bg-cyan-500`}
                            onClick={() => {
                                void openFilePicker();
                            }}
                            type="button"
                            disabled={isDecoding}
                        >
                            <span>Open Track</span>
                            {isDecoding && analysisAction === "open" ? (
                                <span
                                    className="h-3 w-3 animate-spin rounded-full border-2 border-white/35 border-t-white"
                                    aria-hidden="true"
                                />
                            ) : null}
                        </button>
                        <button
                            className={`${buttonClass} inline-flex items-center justify-center gap-2`}
                            type="button"
                            onClick={() => {
                                void reanalyzeCurrentTrack();
                            }}
                            disabled={!hasTrackLoaded || isDecoding}
                        >
                            <span>Re-analyze Track</span>
                            {isDecoding && analysisAction === "reanalyze" ? (
                                <span
                                    className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-100/40 border-t-cyan-100"
                                    aria-hidden="true"
                                />
                            ) : null}
                        </button>
                    </div>
                    {error ? (
                        <p className="mt-2 text-xs text-rose-300">{error}</p>
                    ) : null}
                </section>

                <section className={panelClass}>
                    <h2 className={headingClass}>Track History</h2>
                    {trackHistory.length === 0 ? (
                        <p className="text-xs text-slate-400">No tracks loaded yet.</p>
                    ) : (
                        <div className="grid max-h-44 gap-1 overflow-auto pr-0.5">
                            {trackHistory.map((item) => {
                                const isActive = activeTrackHistoryId === item.id;
                                return (
                                    <div
                                        key={item.id}
                                        className={`group flex min-w-0 items-center justify-between gap-2 rounded-sm border px-2 py-1 transition ${
                                            isActive
                                                ? "border-cyan-600 bg-slate-800"
                                                : "border-slate-700 bg-slate-900 hover:border-slate-500"
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-45"
                                            onClick={() => {
                                                void loadTrackFromHistory(item.id);
                                            }}
                                            disabled={isDecoding}
                                            title={item.name}
                                        >
                                            <span className="block truncate text-xs text-slate-200">
                                                {item.name}
                                            </span>
                                        </button>
                                        <div className="relative h-4 w-12 shrink-0">
                                            <small className="absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[0.65rem] text-slate-400 transition-opacity group-hover:opacity-0 group-focus-within:opacity-0">
                                                {formatTime(item.duration)}
                                            </small>
                                            <button
                                                type="button"
                                                className="absolute right-0 top-1/2 hidden h-4 w-4 -translate-y-1/2 items-center justify-center rounded-sm text-xs leading-none text-slate-300 transition-colors hover:bg-slate-700 hover:text-white group-hover:inline-flex group-focus-within:inline-flex disabled:cursor-not-allowed disabled:opacity-45"
                                                onClick={() => {
                                                    void removeTrackFromHistory(item.id);
                                                }}
                                                disabled={isDecoding}
                                                aria-label={`Remove ${item.name} from history`}
                                                title="Remove from history"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                <section className={panelClass}>
                    <h2 className={headingClass}>Deck Controls</h2>
                    <div className="grid grid-cols-2 gap-1.5">
                        <button
                            className={`${buttonClass} col-span-2`}
                            type="button"
                            onClick={() => {
                                void togglePlayback();
                            }}
                            disabled={!hasTrackLoaded || isDecoding}
                        >
                            {isPlaying ? "Pause" : "Play"}
                        </button>
                        <button
                            className={buttonClass}
                            type="button"
                            onClick={() => skipBy(-10)}
                            disabled={!hasTrackLoaded || isDecoding}
                        >
                            -10s
                        </button>
                        <button
                            className={buttonClass}
                            type="button"
                            onClick={() => skipBy(10)}
                            disabled={!hasTrackLoaded || isDecoding}
                        >
                            +10s
                        </button>
                        <button
                            className={buttonClass}
                            type="button"
                            onClick={() => {
                                if (beatJumpSeconds === null) {
                                    return;
                                }
                                skipBy(-beatJumpSeconds);
                            }}
                            disabled={!hasTrackLoaded || isDecoding || beatJumpSeconds === null}
                        >
                            -1 Beat
                        </button>
                        <button
                            className={buttonClass}
                            type="button"
                            onClick={() => {
                                if (beatJumpSeconds === null) {
                                    return;
                                }
                                skipBy(beatJumpSeconds);
                            }}
                            disabled={!hasTrackLoaded || isDecoding || beatJumpSeconds === null}
                        >
                            +1 Beat
                        </button>
                        <button
                            className={buttonClass}
                            type="button"
                            onClick={() => {
                                if (barJumpSeconds === null) {
                                    return;
                                }
                                skipBy(-barJumpSeconds);
                            }}
                            disabled={!hasTrackLoaded || isDecoding || barJumpSeconds === null}
                        >
                            -1 Bar
                        </button>
                        <button
                            className={buttonClass}
                            type="button"
                            onClick={() => {
                                if (barJumpSeconds === null) {
                                    return;
                                }
                                skipBy(barJumpSeconds);
                            }}
                            disabled={!hasTrackLoaded || isDecoding || barJumpSeconds === null}
                        >
                            +1 Bar
                        </button>
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                        <button
                            className={buttonClass}
                            type="button"
                            onClick={setCue}
                            disabled={!hasTrackLoaded || isDecoding}
                        >
                            Set Cue
                        </button>
                        <button
                            className={buttonClass}
                            type="button"
                            onClick={jumpToCue}
                            disabled={cuePoint === null || isDecoding}
                        >
                            Jump Cue
                        </button>
                    </div>
                </section>

                <section className={panelClass}>
                    <h2 className={headingClass}>Mixer</h2>
                    <label className="grid gap-1.5 font-mono text-[0.64rem] uppercase tracking-[0.1em] text-slate-400">
                        Output level
                        <input
                            className="groov-range"
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={volume}
                            style={
                                {
                                    "--range-progress": `${Math.round(volume * 100)}%`,
                                } as CSSProperties
                            }
                            onChange={(event) => {
                                setVolume(Number(event.target.value));
                            }}
                            disabled={!hasTrackLoaded}
                        />
                    </label>
                </section>
            </div>
        </aside>
    );
}
