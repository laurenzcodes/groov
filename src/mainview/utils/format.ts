export const formatTime = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return "00:00";
    }

    const minutes = Math.floor(seconds / 60)
        .toString()
        .padStart(2, "0");
    const remainder = Math.floor(seconds % 60)
        .toString()
        .padStart(2, "0");
    return `${minutes}:${remainder}`;
};

export const formatTimeDetailed = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return "00:00.000";
    }

    const minutes = Math.floor(seconds / 60)
        .toString()
        .padStart(2, "0");
    const secs = Math.floor(seconds % 60)
        .toString()
        .padStart(2, "0");
    const millis = Math.floor((seconds % 1) * 1000)
        .toString()
        .padStart(3, "0");

    return `${minutes}:${secs}.${millis}`;
};

export const formatSize = (bytes: number): string => {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
