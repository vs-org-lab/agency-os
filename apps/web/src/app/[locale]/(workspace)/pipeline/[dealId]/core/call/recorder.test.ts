import { describe, expect, it, vi } from 'vitest';
import { audioTypeForFile, formatElapsed, RecordingCaptureError, startCapture } from './recorder';

function track(kind: 'audio' | 'video') {
  return { kind, stop: vi.fn() } as unknown as MediaStreamTrack;
}

function stream(tracks: MediaStreamTrack[]) {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((entry) => entry.kind === 'audio'),
  } as unknown as MediaStream;
}

describe('startCapture', () => {
  it('refuses a capture without tab audio', async () => {
    const video = track('video');
    const devices = {
      getDisplayMedia: vi.fn(async () => stream([video])),
      getUserMedia: vi.fn(),
    };

    const failure = await startCapture(devices).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RecordingCaptureError);
    expect((failure as RecordingCaptureError).code).toBe('no_tab_audio');
    expect(video.stop).toHaveBeenCalled();
    expect(devices.getUserMedia).not.toHaveBeenCalled();
  });

  it('releases the shared tab when the microphone is denied', async () => {
    const audio = track('audio');
    const video = track('video');
    const devices = {
      getDisplayMedia: vi.fn(async () => stream([video, audio])),
      getUserMedia: vi.fn(async () => {
        throw new DOMException('denied', 'NotAllowedError');
      }),
    };

    const failure = await startCapture(devices).catch((error: unknown) => error);

    expect((failure as RecordingCaptureError).code).toBe('permission_denied');
    expect(audio.stop).toHaveBeenCalled();
    expect(video.stop).toHaveBeenCalled();
  });

  it('reports a browser without tab capture', async () => {
    const failure = await startCapture(undefined).catch((error: unknown) => error);

    expect((failure as RecordingCaptureError).code).toBe('unsupported');
  });
});

describe('audioTypeForFile', () => {
  it('accepts the bucket types and infers common extensions', () => {
    expect(audioTypeForFile(new File([], 'call.mp3', { type: 'audio/mpeg' }))).toBe('audio/mpeg');
    expect(audioTypeForFile(new File([], 'call.m4a', { type: '' }))).toBe('audio/mp4');
    expect(audioTypeForFile(new File([], 'call.WAV', { type: 'audio/x-wav' }))).toBe('audio/wav');
    expect(audioTypeForFile(new File([], 'notes.pdf', { type: 'application/pdf' }))).toBeNull();
  });
});

describe('formatElapsed', () => {
  it('shows minutes and seconds, and hours past one hour', () => {
    expect(formatElapsed(65_000)).toBe('01:05');
    expect(formatElapsed(3_725_000)).toBe('1:02:05');
  });
});
