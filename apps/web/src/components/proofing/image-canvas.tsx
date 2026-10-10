'use client';

import { PinSurface } from './pin-surface';
import { Pins, type Pin } from './pins';

/** An image proof; clicking the image, or the keyboard, picks a point in percent of its size. */
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
    <PinSurface canPin={canPin} pending={pending} onPick={onPick}>
      <img src={src} alt={alt} className="block max-h-[70vh] max-w-full" draggable={false} />
      <Pins pins={pins} pending={pending} activeId={activeId} onSelect={onSelect} />
    </PinSurface>
  );
}
