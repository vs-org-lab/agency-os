'use client';

import * as React from 'react';
import { cn } from '@agency-os/ui/lib/utils';
import { m, transitions, useReducedMotion } from '@agency-os/ui/motion';

type ScoreSliderProps = {
  name: string;
  label: string;
  max: number;
  defaultValue?: number | null;
  disabled?: boolean;
  clearLabel: string;
  valueText: (value: number | null, max: number) => string;
  id?: string;
  className?: string;
};

const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);

/** Integer score from 0 to `max` with an explicit "no score" state, submitted through a hidden input. */
function ScoreSlider({
  name,
  label,
  max,
  defaultValue = null,
  disabled = false,
  clearLabel,
  valueText,
  id,
  className,
}: ScoreSliderProps) {
  const [value, setValue] = React.useState<number | null>(defaultValue);
  const [dragging, setDragging] = React.useState(false);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const fraction = max > 0 && value !== null ? value / max : 0;

  const fromPointer = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setValue(clamp(Math.round(((clientX - rect.left) / rect.width) * max), max));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const current = value ?? 0;
    const next: Record<string, number> = {
      ArrowRight: current + 1,
      ArrowUp: current + 1,
      ArrowLeft: current - 1,
      ArrowDown: current - 1,
      PageUp: current + 2,
      PageDown: current - 2,
      Home: 0,
      End: max,
    };
    const target = next[event.key];
    if (target === undefined) return;
    event.preventDefault();
    setValue(clamp(target, max));
  };

  return (
    <div data-slot="score-slider" className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center gap-3">
        <div
          ref={trackRef}
          className={cn(
            'relative h-6 flex-1 touch-none select-none',
            disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
          )}
          onPointerDown={(event) => {
            if (disabled) return;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            setDragging(true);
            fromPointer(event.clientX);
            event.currentTarget.querySelector<HTMLElement>('[role="slider"]')?.focus();
          }}
          onPointerMove={(event) => {
            if (dragging) fromPointer(event.clientX);
          }}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
        >
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-border" />
          <div
            className="absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full bg-brand"
            style={{ width: `${fraction * 100}%` }}
          />
          {Array.from({ length: max + 1 }, (_, point) => (
            <span
              key={point}
              aria-hidden="true"
              className="absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-tertiary"
              style={{ left: `${(max > 0 ? point / max : 0) * 100}%` }}
            />
          ))}
          <div className="absolute top-1/2 size-0" style={{ left: `${fraction * 100}%` }}>
            <m.div
              id={id}
              role="slider"
              tabIndex={disabled ? -1 : 0}
              aria-label={label}
              aria-valuemin={0}
              aria-valuemax={max}
              aria-valuenow={value ?? undefined}
              aria-valuetext={valueText(value, max)}
              aria-disabled={disabled}
              onKeyDown={onKeyDown}
              animate={{ scale: dragging && !reducedMotion ? 1.25 : 1 }}
              transition={reducedMotion ? { duration: 0 } : transitions.morph}
              className={cn(
                '-translate-x-1/2 -translate-y-1/2 size-5 rounded-full border-2 bg-surface outline-none focus-visible:ring-2 focus-visible:ring-ring',
                value === null ? 'border-border' : 'border-brand',
              )}
            />
          </div>
        </div>
        <span
          aria-hidden="true"
          className="w-12 shrink-0 text-right text-body-sm text-text tabular-nums"
        >
          {value === null ? '–' : `${value}/${max}`}
        </span>
        {!disabled ? (
          <button
            type="button"
            disabled={value === null}
            onClick={() => setValue(null)}
            className="rounded-md px-1 text-caption text-text-secondary underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:invisible"
          >
            {clearLabel}
          </button>
        ) : null}
      </div>
      <input type="hidden" name={name} value={value ?? ''} />
    </div>
  );
}

export { ScoreSlider };
export type { ScoreSliderProps };
