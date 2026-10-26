'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Playback state for an audio or video element. The length comes from the caller because the
 * browser reports an infinite duration for MediaRecorder output.
 */
export function usePlayback<T extends HTMLMediaElement>() {
  const ref = useRef<T | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);

  const toggle = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    if (element.paused) void element.play().catch(() => setPlaying(false));
    else element.pause();
  }, []);

  const seek = useCallback((seconds: number) => {
    const element = ref.current;
    if (element) element.currentTime = seconds;
    setTime(seconds);
  }, []);

  const mediaProps = {
    ref,
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onTimeUpdate: () => setTime(ref.current?.currentTime ?? 0),
  };

  return { playing, time, toggle, seek, mediaProps };
}
