import type { ProofAnchor } from '@/modules/proofing';

/** Seconds as m:ss or h:mm:ss for video comment labels. */
export function formatSeconds(seconds: number): string {
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

export type AnchorLabel =
  | { key: 'general' }
  | { key: 'point'; number: number }
  | { key: 'pagePoint'; number: number; page: number }
  | { key: 'time'; number: number; time: string };

export function anchorLabel(anchor: ProofAnchor | null, number: number | null): AnchorLabel {
  if (!anchor || number === null) return { key: 'general' };
  if (anchor.type === 'point') return { key: 'point', number };
  if (anchor.type === 'page_point') return { key: 'pagePoint', number, page: anchor.page };
  return { key: 'time', number, time: formatSeconds(anchor.seconds) };
}

/** Percent of the element's box where the pointer landed, rounded to one decimal. */
export function pointerPercent(
  event: { clientX: number; clientY: number },
  box: { left: number; top: number; width: number; height: number },
): { x: number; y: number } | null {
  if (box.width <= 0 || box.height <= 0) return null;
  const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value * 10) / 10));
  return {
    x: clamp(((event.clientX - box.left) / box.width) * 100),
    y: clamp(((event.clientY - box.top) / box.height) * 100),
  };
}
