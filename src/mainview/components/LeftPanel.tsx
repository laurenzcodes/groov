import { useDeckContext } from "../context/DeckContext";
import { formatTime } from "../utils/format";

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
        reanalyzeCurrentTrack,
    } = useDeckContext();
    const outputLevelFill = `calc(${volume} * (100% - 4px) + 2px) 100%`;

    return (
        <aside className="left-panel">
            <section className="panel-block">
                <h2>Source</h2>
                <button
                    className="primary-btn"
                    onClick={() => {
                        void openFilePicker();
                    }}
                    type="button"
                    disabled={isDecoding}
                >
                    <span className="primary-btn-label">Open Track</span>
                    {isDecoding && analysisAction === "open" ? (
                        <span className="spinner" aria-hidden="true" />
                    ) : null}
                </button>
                <button
                    className="loading-btn"
                    type="button"
                    onClick={() => {
                        void reanalyzeCurrentTrack();
                    }}
                    disabled={!hasTrackLoaded || isDecoding}
                >
                    <span>Re-analyze Track</span>
                    {isDecoding && analysisAction === "reanalyze" ? (
                        <span className="spinner spinner-secondary" aria-hidden="true" />
                    ) : null}
                </button>
                {error && <p className="error-text">{error}</p>}
            </section>

            <section className="panel-block history-stack">
                <h2>Track History</h2>
                {trackHistory.length === 0 ? (
                    <p className="history-empty">No tracks loaded yet.</p>
                ) : (
                    <div className="history-list">
                        {trackHistory.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className={`history-item${activeTrackHistoryId === item.id ? " is-active" : ""}`}
                                onClick={() => {
                                    void loadTrackFromHistory(item.id);
                                }}
                                disabled={isDecoding}
                                title={item.name}
                            >
                                <span>{item.name}</span>
                                <small>{formatTime(item.duration)}</small>
                            </button>
                        ))}
                    </div>
                )}
            </section>

            <section className="panel-block controls">
                <h2>Deck Controls</h2>
                <div className="button-grid">
                    <button
                        type="button"
                        onClick={() => {
                            void togglePlayback();
                        }}
                        disabled={!hasTrackLoaded || isDecoding}
                    >
                        {isPlaying ? "Pause" : "Play"}
                    </button>
                    <button
                        type="button"
                        onClick={() => skipBy(-10)}
                        disabled={!hasTrackLoaded || isDecoding}
                    >
                        -10s
                    </button>
                    <button
                        type="button"
                        onClick={() => skipBy(10)}
                        disabled={!hasTrackLoaded || isDecoding}
                    >
                        +10s
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (beatJumpSeconds === null) {
                                return;
                            }
                            skipBy(-beatJumpSeconds);
                        }}
                        disabled={
                            !hasTrackLoaded ||
                            isDecoding ||
                            beatJumpSeconds === null
                        }
                    >
                        -1 Beat
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (beatJumpSeconds === null) {
                                return;
                            }
                            skipBy(beatJumpSeconds);
                        }}
                        disabled={
                            !hasTrackLoaded ||
                            isDecoding ||
                            beatJumpSeconds === null
                        }
                    >
                        +1 Beat
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (barJumpSeconds === null) {
                                return;
                            }
                            skipBy(-barJumpSeconds);
                        }}
                        disabled={
                            !hasTrackLoaded ||
                            isDecoding ||
                            barJumpSeconds === null
                        }
                    >
                        -1 Bar
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (barJumpSeconds === null) {
                                return;
                            }
                            skipBy(barJumpSeconds);
                        }}
                        disabled={
                            !hasTrackLoaded ||
                            isDecoding ||
                            barJumpSeconds === null
                        }
                    >
                        +1 Bar
                    </button>
                </div>
                <div className="cue-row">
                    <button
                        type="button"
                        onClick={setCue}
                        disabled={!hasTrackLoaded || isDecoding}
                    >
                        Set Cue
                    </button>
                    <button
                        type="button"
                        onClick={jumpToCue}
                        disabled={cuePoint === null || isDecoding}
                    >
                        Jump Cue
                    </button>
                </div>
            </section>

            <section className="panel-block">
                <h2>Mixer</h2>
                <label className="slider-label">
                    Output level
                    <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={volume}
                        style={{ backgroundSize: outputLevelFill }}
                        onChange={(event) => {
                            setVolume(Number(event.target.value));
                        }}
                        disabled={!hasTrackLoaded}
                    />
                </label>
            </section>
        </aside>
    );
}
