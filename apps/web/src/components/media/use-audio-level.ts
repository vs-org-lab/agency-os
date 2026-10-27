'use client';

import { useEffect, useState } from 'react';

const LEVEL_STEPS = 20;

/** The microphone level of a stream from 0 to 1, in coarse steps so it rarely re-renders. */
export function useAudioLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) return;
    const Context = globalThis.AudioContext;
    if (typeof Context !== 'function') return;
    let frame = 0;
    let context: AudioContext | null = null;
    try {
      context = new Context();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const read = () => {
        analyser.getByteTimeDomainData(samples);
        let peak = 0;
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128));
        setLevel(Math.round(Math.min(peak / 64, 1) * LEVEL_STEPS) / LEVEL_STEPS);
        frame = requestAnimationFrame(read);
      };
      read();
    } catch {
      return;
    }
    return () => {
      cancelAnimationFrame(frame);
      void context?.close().catch(() => undefined);
      setLevel(0);
    };
  }, [stream]);

  return level;
}
