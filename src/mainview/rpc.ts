import { Electroview } from "electrobun/view";
import type { GroovRPC } from "../shared/rpc";

export type AnalysisProgressEvent = {
    token: number;
    stage: "cache" | "probe" | "decode" | "analyze";
    progress: number;
};

const progressListeners = new Set<(event: AnalysisProgressEvent) => void>();

const rpc = Electroview.defineRPC<GroovRPC>({
    maxRequestTime: Infinity,
    handlers: {
        requests: {},
        messages: {
            analysisProgress: (payload) => {
                for (const listener of progressListeners) {
                    listener(payload);
                }
            },
        },
    },
});

new Electroview({ rpc });

export const groovRpc = rpc;

export const onAnalysisProgress = (
    callback: (event: AnalysisProgressEvent) => void,
): (() => void) => {
    progressListeners.add(callback);
    return () => {
        progressListeners.delete(callback);
    };
};
