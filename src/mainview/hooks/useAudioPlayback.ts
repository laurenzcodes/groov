import {
    type MutableRefObject,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

type UseAudioPlaybackResult = {
    audioBuffer: AudioBuffer | null;
    setAudioBuffer: (buffer: AudioBuffer | null) => void;
    currentTime: number;
    setCurrentTime: (time: number) => void;
    isPlaying: boolean;
    volume: number;
    setOutputVolume: (nextVolume: number) => void;
    startOffsetRef: MutableRefObject<number>;
    getPlaybackTime: () => number;
    startPlayback: (offset: number) => Promise<void>;
    pausePlayback: () => void;
    seekTo: (targetTime: number) => void;
    resetPlaybackPosition: () => void;
};

export const useAudioPlayback = (initialVolume = 1): UseAudioPlaybackResult => {
    const audioContextRef = useRef<AudioContext | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);
    const audioBufferRef = useRef<AudioBuffer | null>(null);
    const startContextTimeRef = useRef(0);
    const startOffsetRef = useRef(0);
    const rafRef = useRef<number | null>(null);

    const [audioBuffer, setAudioBufferState] = useState<AudioBuffer | null>(
        null,
    );
    const [currentTime, setCurrentTimeState] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(initialVolume);

    useEffect(() => {
        audioBufferRef.current = audioBuffer;
    }, [audioBuffer]);

    const ensureAudioContext = useCallback(() => {
        if (!audioContextRef.current) {
            const context = new AudioContext({ latencyHint: "interactive" });
            const gainNode = context.createGain();
            gainNode.gain.value = volume;
            gainNode.connect(context.destination);
            audioContextRef.current = context;
            gainNodeRef.current = gainNode;
        }

        return audioContextRef.current;
    }, [volume]);

    const cancelAnimationFrameLoop = useCallback(() => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    }, []);

    const stopSource = useCallback(() => {
        if (!sourceRef.current) {
            return;
        }

        sourceRef.current.onended = null;
        sourceRef.current.stop();
        sourceRef.current.disconnect();
        sourceRef.current = null;
    }, []);

    const getPlaybackTime = useCallback(() => {
        const context = audioContextRef.current;
        const buffer = audioBufferRef.current;

        if (!context || !buffer || !isPlaying) {
            return startOffsetRef.current;
        }

        const elapsed = context.currentTime - startContextTimeRef.current;
        return Math.min(startOffsetRef.current + elapsed, buffer.duration);
    }, [isPlaying]);

    const startPlayback = useCallback(
        async (offset: number) => {
            const context = ensureAudioContext();
            const buffer = audioBufferRef.current;
            const gainNode = gainNodeRef.current;

            if (!buffer || !gainNode) {
                return;
            }

            await context.resume();
            stopSource();

            const source = context.createBufferSource();
            source.buffer = buffer;
            source.connect(gainNode);

            const clampedOffset = Math.min(
                Math.max(offset, 0),
                buffer.duration,
            );
            startOffsetRef.current = clampedOffset;
            startContextTimeRef.current = context.currentTime;

            source.onended = () => {
                if (sourceRef.current !== source) {
                    return;
                }

                sourceRef.current = null;
                cancelAnimationFrameLoop();
                startOffsetRef.current = buffer.duration;
                setCurrentTimeState(buffer.duration);
                setIsPlaying(false);
            };

            source.start(0, clampedOffset);
            sourceRef.current = source;
            setIsPlaying(true);
        },
        [cancelAnimationFrameLoop, ensureAudioContext, stopSource],
    );

    const pausePlayback = useCallback(() => {
        if (!audioBufferRef.current || !isPlaying) {
            return;
        }

        const nextOffset = getPlaybackTime();
        stopSource();
        cancelAnimationFrameLoop();
        startOffsetRef.current = nextOffset;
        setCurrentTimeState(nextOffset);
        setIsPlaying(false);
    }, [cancelAnimationFrameLoop, getPlaybackTime, isPlaying, stopSource]);

    const seekTo = useCallback(
        (targetTime: number) => {
            const buffer = audioBufferRef.current;
            if (!buffer) {
                return;
            }

            const clampedTime = Math.min(
                Math.max(targetTime, 0),
                buffer.duration,
            );
            startOffsetRef.current = clampedTime;
            setCurrentTimeState(clampedTime);

            if (isPlaying) {
                void startPlayback(clampedTime);
            }
        },
        [isPlaying, startPlayback],
    );

    const setOutputVolume = useCallback((nextVolume: number) => {
        setVolume(nextVolume);
        const context = audioContextRef.current;
        const gainNode = gainNodeRef.current;

        if (context && gainNode) {
            gainNode.gain.setTargetAtTime(
                nextVolume,
                context.currentTime,
                0.01,
            );
        }
    }, []);

    const setAudioBuffer = useCallback(
        (buffer: AudioBuffer | null) => {
            if (!buffer) {
                stopSource();
                cancelAnimationFrameLoop();
                setIsPlaying(false);
            }
            setAudioBufferState(buffer);
        },
        [cancelAnimationFrameLoop, stopSource],
    );

    const setCurrentTime = useCallback((time: number) => {
        startOffsetRef.current = time;
        setCurrentTimeState(time);
    }, []);

    const resetPlaybackPosition = useCallback(() => {
        startOffsetRef.current = 0;
        setCurrentTimeState(0);
        setIsPlaying(false);
    }, []);

    useEffect(() => {
        if (!isPlaying) {
            cancelAnimationFrameLoop();
            return;
        }

        const tick = () => {
            const buffer = audioBufferRef.current;
            if (!buffer) {
                setIsPlaying(false);
                return;
            }

            const nextTime = getPlaybackTime();
            setCurrentTimeState(nextTime);

            if (nextTime >= buffer.duration) {
                setIsPlaying(false);
                startOffsetRef.current = buffer.duration;
                return;
            }

            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);

        return () => cancelAnimationFrameLoop();
    }, [cancelAnimationFrameLoop, getPlaybackTime, isPlaying]);

    useEffect(() => {
        return () => {
            cancelAnimationFrameLoop();
            stopSource();
            void audioContextRef.current?.close();
        };
    }, [cancelAnimationFrameLoop, stopSource]);

    return {
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
        resetPlaybackPosition,
    };
};
