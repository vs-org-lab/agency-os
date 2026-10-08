import { isRecordingContentType, type RecordingContentType } from '@/modules/diagnosis';

export type RecordingTrack = 'client' | 'studio';

export type CaptureErrorCode = 'no_tab_audio' | 'permission_denied' | 'unsupported';

export class RecordingCaptureError extends Error {
  constructor(readonly code: CaptureErrorCode) {
    super(`Recording capture failed: ${code}`);
    this.name = 'RecordingCaptureError';
  }
}

export type CaptureDevices = {
  getDisplayMedia(options: DisplayMediaStreamOptions): Promise<MediaStream>;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
};

export type CapturedStreams = {
  client: MediaStream;
  studio: MediaStream;
  /** Fires once when the founder stops sharing the tab from the browser bar. */
  onEnded(listener: () => void): void;
  release(): void;
};

export type RecordedTracks = { client: Blob; studio: Blob };

export type ChunkSink = {
  append(track: RecordingTrack, chunk: Blob): Promise<void>;
};

export const RECORDING_MIME_TYPE = 'audio/webm;codecs=opus';
export const RECORDING_CONTENT_TYPE: RecordingContentType = 'audio/webm';
export const RECORDING_BITS_PER_SECOND = 24_000;
export const RECORDING_CHUNK_MS = 10_000;
export const RECORDING_MAX_MS = 2 * 60 * 60 * 1000;

const EXTENSION_TYPES: Record<string, RecordingContentType> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  webm: 'audio/webm',
};

function stopAll(...streams: MediaStream[]) {
  for (const stream of streams) {
    for (const track of stream.getTracks()) track.stop();
  }
}

/**
 * Captures the shared Meet tab (the client) and the microphone (the studio) as two separate
 * audio streams. A tab shared without audio is refused, because the recording would only hold
 * the studio side of the call.
 */
export async function startCapture(
  devices: CaptureDevices | undefined = globalThis.navigator?.mediaDevices,
): Promise<CapturedStreams> {
  if (!devices || typeof devices.getDisplayMedia !== 'function') {
    throw new RecordingCaptureError('unsupported');
  }

  let display: MediaStream;
  try {
    display = await devices.getDisplayMedia({
      video: true,
      audio: true,
      preferCurrentTab: false,
      selfBrowserSurface: 'exclude',
    } as DisplayMediaStreamOptions);
  } catch {
    throw new RecordingCaptureError('permission_denied');
  }
  if (display.getAudioTracks().length === 0) {
    stopAll(display);
    throw new RecordingCaptureError('no_tab_audio');
  }

  let microphone: MediaStream;
  try {
    microphone = await devices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch {
    stopAll(display);
    throw new RecordingCaptureError('permission_denied');
  }

  return {
    client: new MediaStream(display.getAudioTracks()),
    studio: new MediaStream(microphone.getAudioTracks()),
    onEnded(listener) {
      let fired = false;
      for (const track of display.getTracks()) {
        track.addEventListener('ended', () => {
          if (fired) return;
          fired = true;
          listener();
        });
      }
    },
    release() {
      stopAll(display, microphone);
    },
  };
}

/** Records both streams in parallel, handing every ten-second chunk to the sink as it arrives. */
export function recordStreams(
  streams: Pick<CapturedStreams, 'client' | 'studio'>,
  sink: ChunkSink,
): { stop(): Promise<RecordedTracks> } {
  const options: MediaRecorderOptions = { audioBitsPerSecond: RECORDING_BITS_PER_SECOND };
  if (MediaRecorder.isTypeSupported(RECORDING_MIME_TYPE)) options.mimeType = RECORDING_MIME_TYPE;

  const record = (track: RecordingTrack, stream: MediaStream) => {
    const parts: Blob[] = [];
    const recorder = new MediaRecorder(stream, options);
    const stopped = new Promise<Blob>((resolve) => {
      recorder.addEventListener('stop', () =>
        resolve(new Blob(parts, { type: RECORDING_CONTENT_TYPE })),
      );
    });
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size === 0) return;
      parts.push(event.data);
      void sink.append(track, event.data).catch(() => undefined);
    });
    recorder.start(RECORDING_CHUNK_MS);
    return {
      stop() {
        if (recorder.state !== 'inactive') recorder.stop();
        return stopped;
      },
    };
  };

  const client = record('client', streams.client);
  const studio = record('studio', streams.studio);
  return {
    async stop() {
      const [clientBlob, studioBlob] = await Promise.all([client.stop(), studio.stop()]);
      return { client: clientBlob, studio: studioBlob };
    },
  };
}

export function audioTypeForFile(file: File): RecordingContentType | null {
  if (isRecordingContentType(file.type)) return file.type;
  const extension = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase();
  return EXTENSION_TYPES[extension] ?? null;
}

/** Uploads one track to its signed upload URL the way the Supabase storage client does. */
export async function uploadTrack(url: string, blob: Blob): Promise<boolean> {
  const form = new FormData();
  form.append('cacheControl', '3600');
  form.append('', blob);
  const response = await fetch(url, {
    method: 'PUT',
    body: form,
    headers: { 'x-upsert': 'false' },
  }).catch(() => null);
  return response?.ok ?? false;
}

export function formatElapsed(milliseconds: number): string {
  const total = Math.floor(milliseconds / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
