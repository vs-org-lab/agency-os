'use client';

import { pointerPercent } from './anchor-format';
import { Pins, type Pin } from './pins';

/** An image proof; clicking the image picks a point in percent of its size. */
export function ImageCanvas({
  src,
  alt,
  pins,
  pending,
  activeId,
  canPin,
  onPick,
  onSelect,
}: {
  src: string;
  alt: string;
  pins: Pin[];
  pending: { x: number; y: number } | null;
  activeId: string | null;
  canPin: boolean;
  onPick: (point: { x: number; y: number }) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className="relative mx-auto w-fit max-w-full cursor-crosshair select-none"
      onClick={(event) => {
        if (!canPin) return;
        const point = pointerPercent(event, event.currentTarget.getBoundingClientRect());
        if (point) onPick(point);
      }}
    >
      <img src={src} alt={alt} className="block max-h-[70vh] max-w-full" draggable={false} />
      <Pins pins={pins} pending={pending} activeId={activeId} onSelect={onSelect} />
    </div>
  );
}
