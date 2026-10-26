'use client';

import * as React from 'react';
import { cn } from '@agency-os/ui/lib/utils';

type TimeScrubberMarker = { time: number; label: string };

type TimeScrubberProps = {
  /** The position in seconds. */
  value: number;
  /** The length in seconds. */
  duration: number;
  onValueChange: (seconds: number) => void;
  label: string;
  /** Seconds moved by the arrow keys. */
  step?: number;
  /** Chapter marks that jump to their time. */
  markers?: readonly TimeScrubberMarker[];
  className?: string;
};

function formatClock(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);

/** A time bar for audio and video: pointer seeking, arrow keys, Home and End, optional chapter marks. */
function TimeScrubber({
  value,
  duration,
  onValueChange,
  label,
  step = 5,
  markers,
  className,
}: TimeScrubberProps) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef(false);
  const position = clamp(value, duration);
  const fraction = duration > 0 ? position / duration : 0;

  const seek = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    onValueChange(Math.round(clamp((clientX - rect.left) / rect.width, 1) * duration));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowRight: clamp(position + step, duration),
      ArrowUp: clamp(position + step, duration),
      ArrowLeft: clamp(position - step, duration),
      ArrowDown: clamp(position - step, duration),
      Home: 0,
      End: duration,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onValueChange(next);
  };

  return (
    <div data-slot="time-scrubber" className={cn('flex flex-col gap-1', className)}>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={position}
        aria-valuetext={`${formatClock(position)} / ${formatClock(duration)}`}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          seek(event.clientX);
        }}
        onPointerMove={(event) => {
          if (dragging.current) seek(event.clientX);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
        className="relative flex h-6 w-full cursor-pointer touch-none items-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <div className="bg-border relative h-1.5 w-full rounded-full">
          <div
            className="bg-brand absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${fraction * 100}%` }}
          />
          <div
            className="bg-brand absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-sm"
            style={{ left: `${fraction * 100}%` }}
          />
        </div>
      </div>
      {markers && markers.length > 0 ? (
        <div className="relative h-6 w-full">
          {markers.map((marker) => (
            <button
              key={`${marker.time}-${marker.label}`}
              type="button"
              aria-label={marker.label}
              title={marker.label}
              onClick={() => onValueChange(clamp(marker.time, duration))}
              className="bg-surface border-border hover:bg-brand absolute top-0 size-3 -translate-x-1/2 rounded-full border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              style={{
                left: `${duration > 0 ? (clamp(marker.time, duration) / duration) * 100 : 0}%`,
              }}
            />
          ))}
        </div>
      ) : null}
      <div
        className="text-text-secondary flex justify-between text-xs tabular-nums"
        aria-hidden="true"
      >
        <span>{formatClock(position)}</span>
        <span>{formatClock(duration)}</span>
      </div>
    </div>
  );
}

export { TimeScrubber, formatClock };
export type { TimeScrubberMarker, TimeScrubberProps };
