import { vi } from 'vitest';

export class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported = (type: string) =>
    type.startsWith('audio/webm') || type.startsWith('video/webm');

  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(
    readonly stream: MediaStream,
    options: MediaRecorderOptions = {},
  ) {
    this.mimeType = options.mimeType ?? '';
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = 'recording';
  }

  pause() {
    this.state = 'paused';
  }

  resume() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({
      data: new Blob([new Uint8Array([1, 2, 3])], { type: this.mimeType }),
    });
    this.onstop?.();
  }
}

export type FakeTrack = { kind: 'audio' | 'video'; stop: ReturnType<typeof vi.fn> };

export function fakeStream(kinds: Array<'audio' | 'video'> = ['audio']): MediaStream & {
  tracks: FakeTrack[];
} {
  const tracks: FakeTrack[] = kinds.map((kind) => ({ kind, stop: vi.fn() }));
  return {
    tracks,
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((track) => track.kind === 'audio'),
    getVideoTracks: () => tracks.filter((track) => track.kind === 'video'),
  } as unknown as MediaStream & { tracks: FakeTrack[] };
}

type DeviceInfo = Pick<MediaDeviceInfo, 'deviceId' | 'kind' | 'label'>;

/** Installs a recorder and a media device API that grant, or deny, the devices. */
export function installFakeMedia(options: {
  kinds?: Array<'audio' | 'video'>;
  deny?: boolean;
  devices?: DeviceInfo[];
}) {
  FakeMediaRecorder.instances = [];
  const stream = fakeStream(options.kinds);
  const getUserMedia = options.deny
    ? vi.fn(async () => {
        throw new DOMException('Denied', 'NotAllowedError');
      })
    : vi.fn(async () => stream);
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia,
      enumerateDevices: vi.fn(async () => options.devices ?? []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
  return { stream, getUserMedia };
}

export function removeMediaApis() {
  vi.stubGlobal('MediaRecorder', undefined);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
}
