import type { TrackHistoryEntry } from "../../shared/rpc";
import type { TrackInfo } from "../types";

export type TrackHistoryItem = {
    id: string;
    path: string;
    trackInfo: TrackInfo;
    duration: number;
    createdAt: number;
};

export const mapHistoryEntryToItem = (
    item: TrackHistoryEntry,
): TrackHistoryItem => ({
    id: item.id,
    path: item.path,
    trackInfo: {
        name: item.name,
        type: item.type,
        size: item.size,
        sampleRate: item.sampleRate,
        channels: item.channels,
    },
    duration: item.duration,
    createdAt: item.createdAt,
});

export const buildHistoryEntry = (
    id: string,
    path: string,
    type: string,
    trackInfo: TrackInfo,
    duration: number,
): TrackHistoryEntry => ({
    id,
    path,
    name: trackInfo.name,
    type,
    size: trackInfo.size,
    duration,
    sampleRate: trackInfo.sampleRate,
    channels: trackInfo.channels,
    createdAt: Date.now(),
});
