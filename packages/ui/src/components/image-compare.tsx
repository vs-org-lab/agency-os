'use client';

import * as React from 'react';
import { cn } from '@agency-os/ui/lib/utils';

type CompareImage = { src: string; alt: string };

type ImageCompareProps = {
  before: CompareImage;
  after: CompareImage;
  /** Accessible name of the divider. */
  label: string;
  className?: string;
};

const STEP = 5;

const clamp = (value: number) => Math.min(100, Math.max(0, value));

/**
 * Two images stacked with a draggable divider: the left of it shows `before`, the right `after`.
 * The divider is a slider, so the keyboard moves it by 5 points and Home and End go to the ends.
 */
function ImageCompare({ before, after, label, className }: ImageCompareProps) {
  const [position, setPosition] = React.useState(50);
  const dragging = React.useRef(false);
  const surface = React.useRef<HTMLDivElement>(null);

  const moveTo = (clientX: number) => {
    const rect = surface.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setPosition(clamp(Math.round(((clientX - rect.left) / rect.width) * 100)));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const next: Record<string, number> = {
      ArrowLeft: position - STEP,
      ArrowDown: position - STEP,
      ArrowRight: position + STEP,
      ArrowUp: position + STEP,
      Home: 0,
      End: 100,
    };
    const value = next[event.key];
    if (value === undefined) return;
    event.preventDefault();
    setPosition(clamp(value));
  };

  return (
    <div
      ref={surface}
      data-slot="image-compare"
      className={cn('relative inline-block max-w-full touch-none select-none', className)}
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        moveTo(event.clientX);
      }}
      onPointerMove={(event) => {
        if (dragging.current) moveTo(event.clientX);
      }}
      onPointerUp={(event) => {
        dragging.current = false;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      <img
        src={after.src}
        alt={after.alt}
        draggable={false}
        className="block max-h-[70vh] max-w-full"
      />
      <img
        src={before.src}
        alt={before.alt}
        draggable={false}
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        className="pointer-events-none absolute inset-0 size-full object-contain"
      />
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={position}
        onKeyDown={onKeyDown}
        style={{ left: `${position}%` }}
        className="absolute inset-y-0 -ml-3 flex w-6 cursor-ew-resize items-center justify-center outline-none focus-visible:[&>span]:ring-2 focus-visible:[&>span]:ring-ring"
      >
        <span className="h-full w-0.5 bg-surface shadow-sm" />
      </div>
    </div>
  );
}

export { ImageCompare };
export type { CompareImage, ImageCompareProps };
