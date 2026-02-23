import { useDeckContext } from "../context/DeckContext";
import { formatSize, formatTimeDetailed } from "../utils/format";

const formatTrackType = (trackType: string | undefined): string => {
    if (!trackType) {
        return "Unknown";
    }

    return trackType
        .replace(/^audio\//i, "")
        .replace(/[-_]+/g, " ")
        .toUpperCase();
};

const formatSampleRate = (sampleRate: number | undefined): string => {
    if (!sampleRate || sampleRate <= 0) {
        return "--";
    }

    const inKhz = sampleRate / 1000;
    const fractionDigits = Number.isInteger(inKhz) ? 0 : 1;
    return `${inKhz.toFixed(fractionDigits)} kHz`;
};

const formatChannels = (channels: number | undefined): string => {
    if (!channels || channels <= 0) {
        return "--";
    }

    if (channels === 1) {
        return "Mono";
    }

    if (channels === 2) {
        return "Stereo";
    }

    return `${channels} ch`;
};

export function AppFooter() {
    const { trackInfo, waveformData, duration, isDecoding, isPlaying, analysisLabel } =
        useDeckContext();

    const playbackStatus = isDecoding ? "Busy" : isPlaying ? "Live" : "Ready";
    const bpm =
        waveformData?.bpm === null || waveformData?.bpm === undefined
            ? "--"
            : waveformData.bpm.toFixed(1);
    const trackMeta = trackInfo
        ? [
              { label: "Format", value: formatTrackType(trackInfo.type) },
              { label: "Length", value: formatTimeDetailed(duration) },
              { label: "Tempo", value: `${bpm} BPM` },
              { label: "Sample", value: formatSampleRate(trackInfo.sampleRate) },
              { label: "Channels", value: formatChannels(trackInfo.channels) },
              { label: "Size", value: formatSize(trackInfo.size) },
          ]
        : [{ label: "Info", value: "Load a track to view details" }];

    return (
        <footer className="app-footer">
            <div className="app-footer-block">
                <span className="app-footer-label">Status</span>
                <strong className="app-footer-value">{playbackStatus}</strong>
            </div>
            <div className="app-footer-block app-footer-track">
                <span className="app-footer-label">Track</span>
                <div className="app-footer-track-details">
                    <strong className="app-footer-track-name" title={trackInfo?.name}>
                        {trackInfo?.name ?? "No track loaded"}
                    </strong>
                    <div className="app-footer-meta">
                        {trackMeta.map((entry) => (
                            <span key={entry.label} className="app-footer-meta-entry">
                                <strong className="app-footer-meta-label">
                                    {entry.label}:
                                </strong>{" "}
                                <span className="app-footer-meta-value">{entry.value}</span>
                            </span>
                        ))}
                    </div>
                </div>
            </div>
            <div className="app-footer-block app-footer-analysis">
                <span className="app-footer-label">Analysis</span>
                <strong
                    className={`app-footer-value${isDecoding ? " is-loading" : ""}`}
                >
                    {analysisLabel}
                </strong>
            </div>
        </footer>
    );
}
