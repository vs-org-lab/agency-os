'use client';

import { useEffect, useState } from 'react';

export type MediaDeviceOption = { deviceId: string; label: string };

type DeviceLists = { cameras: MediaDeviceOption[]; microphones: MediaDeviceOption[] };

const EMPTY: DeviceLists = { cameras: [], microphones: [] };

/** The cameras and microphones, listed once the permission has been granted (labels need it). */
export function useMediaDevices(enabled: boolean): DeviceLists {
  const [devices, setDevices] = useState<DeviceLists>(EMPTY);

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined') return;
    const media = navigator.mediaDevices;
    if (typeof media?.enumerateDevices !== 'function') return;
    let cancelled = false;
    const refresh = async () => {
      const all = await media.enumerateDevices().catch(() => []);
      if (cancelled) return;
      const pick = (kind: MediaDeviceKind) =>
        all
          .filter((device) => device.kind === kind && device.deviceId !== '')
          .map((device, index) => ({
            deviceId: device.deviceId,
            label:
              device.label || `${kind === 'videoinput' ? 'Camera' : 'Microphone'} ${index + 1}`,
          }));
      setDevices({ cameras: pick('videoinput'), microphones: pick('audioinput') });
    };
    void refresh();
    media.addEventListener?.('devicechange', refresh);
    return () => {
      cancelled = true;
      media.removeEventListener?.('devicechange', refresh);
    };
  }, [enabled]);

  return devices;
}
