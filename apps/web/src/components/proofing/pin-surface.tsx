'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { pointerPercent } from './anchor-format';

type Point = { x: number; y: number };

const CENTRE: Point = { x: 50, y: 50 };
const STEP = 2;
const LARGE_STEP = 10;
const MOVES: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

const clamp = (value: number) => Math.min(100, Math.max(0, value));

/**
 * The surface of an image or PDF page where a comment is pinned: a click picks the point, and
 * from the keyboard Enter or Space marks the centre and the arrow keys move the marker.
 */
export function PinSurface({
  canPin,
  pending,
  onPick,
  children,
}: {
  canPin: boolean;
  pending: Point | null;
  onPick: (point: Point) => void;
  children: ReactNode;
}) {
  const t = useTranslations('proofing.viewer');
  return (
    <div
      role={canPin ? 'application' : undefined}
      aria-label={canPin ? t('pinSurface') : undefined}
      tabIndex={canPin ? 0 : undefined}
      className="relative mx-auto w-fit max-w-full cursor-crosshair select-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={(event) => {
        if (!canPin) return;
        const point = pointerPercent(event, event.currentTarget.getBoundingClientRect());
        if (point) onPick(point);
      }}
      onKeyDown={(event) => {
        if (!canPin || event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onPick(pending ?? CENTRE);
          return;
        }
        const move = MOVES[event.key];
        if (!move) return;
        event.preventDefault();
        const from = pending ?? CENTRE;
        const step = event.shiftKey ? LARGE_STEP : STEP;
        onPick({ x: clamp(from.x + move.x * step), y: clamp(from.y + move.y * step) });
      }}
    >
      {children}
      {canPin && pending ? (
        <span role="status" className="sr-only">
          {t('pinPosition', { x: pending.x, y: pending.y })}
        </span>
      ) : null}
    </div>
  );
}
