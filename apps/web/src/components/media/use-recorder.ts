'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderStatus = 'idle' | 'starting' | 'recording' | 'paused' | 'stopped';
export type RecorderFailure = 'denied' | 'unsupported' | null;

export type Recording = {
  blob: Blob;
  /** Whole seconds, at least one. */
  durationSeconds: number;
  /** The container without codecs, such as "audio/webm". */
  contentType: string;
};

type RecorderOptions = {
  kind: 'audio' | 'video';
  maxSeconds: number;
  audioDeviceId?: string;
  videoDeviceId?: string;
  audioBitsPerSecond?: number;
  videoBitsPerSecond?: number;
};

const AUDIO_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
const VIDEO_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];
const TICK_MS = 250;

function supportedType(candidates: string[]): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  if (typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export function recorderSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

function stopStream(stream: MediaStream | null) {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

function constraintFor(deviceId: string | undefined): true | MediaTrackConstraints {
  return deviceId ? { deviceId: { exact: deviceId } } : true;
}

/**
 * One MediaRecorder session over the microphone, or the camera and the microphone: it opens the
 * devices, counts the recorded time (pauses excluded), stops at the limit and keeps the result.
 */
export function useRecorder(options: RecorderOptions) {
  const { kind, maxSeconds, audioDeviceId, videoDeviceId } = options;
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [failure, setFailure] = useState<RecorderFailure>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [limitReached, setLimitReached] = useState(false);

  const recorder = useRef<MediaRecorder | null>(null);
  const parts = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const elapsedRef = useRef(0);
  const runningSince = useRef<number | null>(null);
  const mounted = useRef(true);

  const release = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    setStream(null);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recorder.current && recorder.current.state !== 'inactive') {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      stopStream(streamRef.current);
    };
  }, []);

  /** Opens the devices so the camera can be previewed before recording starts. */
  const open = useCallback(async (): Promise<MediaStream | null> => {
    if (!recorderSupported()) {
      setFailure('unsupported');
      return null;
    }
    stopStream(streamRef.current);
    setFailure(null);
    try {
      const opened = await navigator.mediaDevices.getUserMedia({
        audio: constraintFor(audioDeviceId),
        video: kind === 'video' ? constraintFor(videoDeviceId) : false,
      });
      if (!mounted.current) {
        stopStream(opened);
        return null;
      }
      streamRef.current = opened;
      setStream(opened);
      return opened;
    } catch {
      if (mounted.current) setFailure('denied');
      return null;
    }
  }, [audioDeviceId, videoDeviceId, kind]);

  const currentElapsed = () =>
    elapsedRef.current + (runningSince.current === null ? 0 : Date.now() - runningSince.current);

  const finish = useCallback(
    (container: string) => {
      const durationSeconds = Math.max(1, Math.round(elapsedRef.current / 1000));
      const blob = new Blob(parts.current, { type: container });
      setRecording({ blob, durationSeconds, contentType: container.split(';')[0] ?? container });
      setStatus('stopped');
      release();
    },
    [release],
  );

  const stop = useCallback(() => {
    const active = recorder.current;
    if (!active || active.state === 'inactive') return;
    if (runningSince.current !== null) {
      elapsedRef.current += Date.now() - runningSince.current;
      runningSince.current = null;
    }
    setElapsedMs(elapsedRef.current);
    active.stop();
  }, []);

  const start = useCallback(async () => {
    const source = streamRef.current ?? (await open());
    if (!source || !mounted.current) return;
    setStatus('starting');
    const mimeType = supportedType(kind === 'video' ? VIDEO_TYPES : AUDIO_TYPES);
    const init: MediaRecorderOptions = {
      audioBitsPerSecond: options.audioBitsPerSecond,
      videoBitsPerSecond: options.videoBitsPerSecond,
    };
    if (mimeType) init.mimeType = mimeType;
    const created = new MediaRecorder(source, init);
    parts.current = [];
    created.ondataavailable = (event) => {
      if (event.data.size > 0) parts.current.push(event.data);
    };
    created.onstop = () => {
      if (mounted.current) finish(created.mimeType || mimeType || `${kind}/webm`);
    };
    recorder.current = created;
    elapsedRef.current = 0;
    setElapsedMs(0);
    setLimitReached(false);
    setRecording(null);
    created.start(1000);
    runningSince.current = Date.now();
    setStatus('recording');
  }, [open, kind, options.audioBitsPerSecond, options.videoBitsPerSecond, finish]);

  const pause = useCallback(() => {
    const active = recorder.current;
    if (!active || active.state !== 'recording') return;
    active.pause();
    if (runningSince.current !== null) {
      elapsedRef.current += Date.now() - runningSince.current;
      runningSince.current = null;
    }
    setElapsedMs(elapsedRef.current);
    setStatus('paused');
  }, []);

  const resume = useCallback(() => {
    const active = recorder.current;
    if (!active || active.state !== 'paused') return;
    active.resume();
    runningSince.current = Date.now();
    setStatus('recording');
  }, []);

  /** Throws the take away and goes back to the start. */
  const discard = useCallback(() => {
    if (recorder.current && recorder.current.state !== 'inactive') {
      recorder.current.onstop = null;
      recorder.current.stop();
    }
    recorder.current = null;
    parts.current = [];
    elapsedRef.current = 0;
    runningSince.current = null;
    setElapsedMs(0);
    setRecording(null);
    setLimitReached(false);
    setStatus('idle');
    release();
  }, [release]);

  useEffect(() => {
    if (status !== 'recording') return;
    const timer = setInterval(() => {
      const elapsed = currentElapsed();
      setElapsedMs(elapsed);
      if (elapsed >= maxSeconds * 1000) {
        setLimitReached(true);
        stop();
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [status, maxSeconds, stop]);

  return {
    status,
    failure,
    stream,
    elapsedMs,
    recording,
    limitReached,
    open,
    start,
    pause,
    resume,
    stop,
    discard,
  };
}

export function formatElapsed(elapsedMs: number): string {
  const whole = Math.max(0, Math.floor(elapsedMs / 1000));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}
