'use client';

import * as React from 'react';
import { cn } from '@agency-os/ui/lib/utils';

type GanttZoom = 'week' | 'month';
type GanttTone = 'done' | 'active' | 'pending';

type GanttRow = {
  id: string;
  label: string;
  /** ISO calendar dates (YYYY-MM-DD), both inclusive. */
  start: string;
  end: string;
  tone?: GanttTone;
};

const DAY_MS = 86_400_000;
const PX_PER_DAY: Record<GanttZoom, number> = { week: 28, month: 8 };
const ROW_REM = 2.25;
const AXIS_REM = 1.5;

const dayNumber = (isoDate: string) => Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / DAY_MS);
const isoOf = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

/** Positions bars as percentages of the span covered by the rows, widened to include today. */
function ganttLayout(rows: readonly GanttRow[], today: string, zoom: GanttZoom) {
  const starts = rows.map((row) => dayNumber(row.start));
  const ends = rows.map((row) => dayNumber(row.end));
  const todayDay = dayNumber(today);
  const first = Math.min(todayDay, ...starts);
  const last = Math.max(todayDay, ...ends);
  const totalDays = last - first + 1;
  const pct = (days: number) => (days / totalDays) * 100;
  const tickEvery = zoom === 'week' ? 7 : 30;
  const ticks = Array.from({ length: Math.ceil(totalDays / tickEvery) }, (_, index) => ({
    pct: pct(index * tickEvery),
    date: isoOf(first + index * tickEvery),
  }));

  return {
    totalDays,
    pxPerDay: PX_PER_DAY[zoom],
    bars: rows.map((row, index) => ({
      id: row.id,
      leftPct: pct(starts[index]! - first),
      widthPct: pct(ends[index]! - starts[index]! + 1),
    })),
    todayPct: pct(todayDay - first),
    ticks,
  };
}

const TONE_CLASS: Record<GanttTone, string> = {
  done: 'bg-text-secondary',
  active: 'bg-brand',
  pending: 'bg-border-strong',
};

type TimelineGanttProps = {
  rows: readonly GanttRow[];
  today: string;
  locale: string;
  label: string;
  todayLabel: string;
  zoomLabel: string;
  zoomWeekLabel: string;
  zoomMonthLabel: string;
  rowLabel: (row: GanttRow) => string;
  className?: string;
};

/** Read-only project timeline: one bar per row, a line for today and a week or month scale. */
function TimelineGantt({
  rows,
  today,
  locale,
  label,
  todayLabel,
  zoomLabel,
  zoomWeekLabel,
  zoomMonthLabel,
  rowLabel,
  className,
}: TimelineGanttProps) {
  const [zoom, setZoom] = React.useState<GanttZoom>('week');
  const rowRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  if (rows.length === 0) return null;

  const layout = ganttLayout(rows, today, zoom);
  const trackWidth = layout.totalDays * layout.pxPerDay;
  const dateFormat = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const tickLabel = (isoDate: string) => dateFormat.format(new Date(`${isoDate}T00:00:00Z`));

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const target: Record<string, number> = {
      ArrowDown: Math.min(index + 1, rows.length - 1),
      ArrowUp: Math.max(index - 1, 0),
      Home: 0,
      End: rows.length - 1,
    };
    const next = target[event.key];
    if (next === undefined) return;
    event.preventDefault();
    rowRefs.current[next]?.focus();
  };

  return (
    <div
      data-slot="timeline-gantt"
      data-zoom={zoom}
      className={cn('flex flex-col gap-3', className)}
    >
      <div
        role="group"
        aria-label={zoomLabel}
        className="inline-flex self-end overflow-hidden rounded-md border border-border"
      >
        {(
          [
            ['week', zoomWeekLabel],
            ['month', zoomMonthLabel],
          ] as const
        ).map(([value, text]) => (
          <button
            key={value}
            type="button"
            aria-pressed={zoom === value}
            onClick={() => setZoom(value)}
            className={cn(
              'px-3 py-1 text-body-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
              zoom === value
                ? 'bg-primary text-primary-foreground'
                : 'text-text hover:bg-surface-muted',
            )}
          >
            {text}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <div
          role="grid"
          aria-label={label}
          className="relative"
          style={{ width: 'max-content', minWidth: '100%' }}
        >
          <div
            aria-hidden="true"
            className="flex border-b border-border text-caption text-text-tertiary"
            style={{ height: `${AXIS_REM}rem` }}
          >
            <div className="sticky left-0 z-10 w-40 shrink-0 bg-surface" />
            <div className="relative" style={{ width: trackWidth }}>
              {layout.ticks.map((tick) => (
                <span
                  key={tick.date}
                  className="absolute top-1 border-l border-border pl-1"
                  style={{ left: `${tick.pct}%` }}
                >
                  {tickLabel(tick.date)}
                </span>
              ))}
            </div>
          </div>
          {rows.map((row, index) => {
            const bar = layout.bars[index]!;
            return (
              <div
                key={row.id}
                ref={(node) => {
                  rowRefs.current[index] = node;
                }}
                role="row"
                aria-label={rowLabel(row)}
                tabIndex={index === 0 ? 0 : -1}
                onKeyDown={(event) => onKeyDown(event, index)}
                onFocus={(event) => {
                  rowRefs.current.forEach((node) => node?.setAttribute('tabindex', '-1'));
                  event.currentTarget.setAttribute('tabindex', '0');
                }}
                className="flex items-center border-b border-border outline-none last:border-b-0 focus-visible:bg-surface-muted"
                style={{ height: `${ROW_REM}rem` }}
              >
                <div
                  role="rowheader"
                  className="sticky left-0 z-10 w-40 shrink-0 truncate bg-surface px-3 text-body-sm text-text"
                >
                  {row.label}
                </div>
                <div role="gridcell" className="relative h-full" style={{ width: trackWidth }}>
                  <div
                    className={cn(
                      'absolute top-1/2 h-3 -translate-y-1/2 rounded-full',
                      TONE_CLASS[row.tone ?? 'pending'],
                    )}
                    style={{ left: `${bar.leftPct}%`, width: `${bar.widthPct}%` }}
                  />
                </div>
              </div>
            );
          })}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-40"
            style={{ width: trackWidth }}
          >
            <div
              data-slot="gantt-today"
              className="absolute inset-y-0 w-px bg-danger"
              style={{ left: `${layout.todayPct}%` }}
            >
              <span className="absolute top-0.5 left-1 rounded-sm bg-danger px-1 text-caption text-white">
                {todayLabel}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { TimelineGantt, ganttLayout };
export type { GanttRow, GanttTone, GanttZoom, TimelineGanttProps };
