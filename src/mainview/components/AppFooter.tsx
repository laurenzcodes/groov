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

    const chipClass =
        "inline-flex items-center rounded-full border border-slate-600 bg-slate-800 px-3 py-1 font-mono text-[0.66rem] uppercase tracking-[0.09em] text-slate-100";

    return (
        <footer
            data-app-footer="true"
            className="relative z-10 grid min-h-[44px] grid-cols-1 gap-2 border-t border-slate-700 bg-slate-900 px-3 py-2 md:grid-cols-[max-content_minmax(0,1fr)_max-content] md:items-center"
        >
            <div className="flex min-w-0 items-center gap-2">
                <span className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-slate-400">
                    Status
                </span>
                <strong className={chipClass}>{playbackStatus}</strong>
            </div>

            <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                <span className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-slate-400">
                    Track
                </span>
                <div className="flex min-w-0 items-baseline gap-3 overflow-hidden">
                    <strong
                        className="truncate text-sm font-semibold tracking-[0.03em] text-slate-100"
                        title={trackInfo?.name}
                    >
                        {trackInfo?.name ?? "No track loaded"}
                    </strong>
                    <div className="hidden min-w-0 items-baseline gap-2 overflow-hidden whitespace-nowrap md:flex">
                        {trackMeta.map((entry) => (
                            <span
                                key={entry.label}
                                className="truncate font-mono text-[0.62rem] uppercase tracking-[0.06em] text-slate-400"
                            >
                                <span className="font-semibold text-slate-300">
                                    {entry.label}:
                                </span>{" "}
                                <span className="text-slate-400">{entry.value}</span>
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex min-w-0 items-center gap-2 md:justify-self-end">
                <span className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-slate-400">
                    Analysis
                </span>
                <strong
                    className={`${chipClass}${isDecoding ? " gap-2" : ""}`}
                >
                    {isDecoding ? (
                        <span
                            aria-hidden="true"
                            className="h-2 w-2 animate-spin rounded-full border border-cyan-100/50 border-t-transparent"
                        />
                    ) : null}
                    {analysisLabel}
                </strong>
            </div>
        </footer>
    );
}
