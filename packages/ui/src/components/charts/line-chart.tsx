'use client';

import * as React from 'react';
import { cn } from '@agency-os/ui/lib/utils';
import { m, transitions, useReducedMotion } from '@agency-os/ui/motion';
import { linePath, niceTicks } from './chart-scale';

type LineSeries = { key: string; label: string; values: Array<number | null> };

type LineChartProps = {
  series: LineSeries[];
  /** One label per data point, already formatted for the reader (for example abbreviated months). */
  labels: string[];
  formatValue: (value: number) => string;
  /** Plain-language description of the data, read by assistive technology. */
  summary: string;
  className?: string;
};

const WIDTH = 640;
const HEIGHT = 240;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 56 };
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;
const MARKER_RADIUS = 4;

const round = (value: number) => Math.round(value * 100) / 100;
const seriesColor = (index: number) => `var(--chart-${(index % 5) + 1})`;

/** Monthly trend lines on one shared axis; the active point is chosen by pointer or arrow keys. */
function LineChart({ series, labels, formatValue, summary, className }: LineChartProps) {
  const reduceMotion = useReducedMotion();
  const [active, setActive] = React.useState<number | null>(null);
  const count = labels.length;

  const numbers = series.flatMap((item) =>
    item.values.filter((value): value is number => value !== null),
  );
  const ticks = niceTicks(Math.min(...numbers, 0), Math.max(...numbers, 0));
  const yMin = ticks[0] ?? 0;
  const yMax = ticks[ticks.length - 1] ?? 1;

  const xAt = (index: number) =>
    round(MARGIN.left + (count > 1 ? (index * PLOT_WIDTH) / (count - 1) : PLOT_WIDTH / 2));
  const yAt = (value: number) =>
    round(MARGIN.top + PLOT_HEIGHT * (1 - (value - yMin) / (yMax - yMin)));

  function onKeyDown(event: React.KeyboardEvent<SVGSVGElement>) {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setActive((current) => (current === null ? 0 : Math.min(current + 1, count - 1)));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setActive((current) => (current === null ? count - 1 : Math.max(current - 1, 0)));
    } else if (event.key === 'Escape') {
      setActive(null);
    }
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || count === 0) return;
    const x = ((event.clientX - box.left) / box.width) * WIDTH;
    const index = Math.round(((x - MARGIN.left) / PLOT_WIDTH) * (count - 1));
    setActive(Math.min(Math.max(index, 0), count - 1));
  }

  return (
    <figure data-slot="line-chart" className={cn('flex flex-col gap-3', className)}>
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={summary}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          className="h-auto w-full rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={yAt(tick)}
                y2={yAt(tick)}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                data-slot="y-tick"
                x={MARGIN.left - 8}
                y={yAt(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-text-tertiary text-[11px]"
              >
                {formatValue(tick)}
              </text>
            </g>
          ))}
          {labels.map((label, index) => (
            <text
              key={`${label}-${index}`}
              x={xAt(index)}
              y={HEIGHT - 8}
              textAnchor="middle"
              className="fill-text-tertiary text-[11px]"
            >
              {label}
            </text>
          ))}
          {active !== null ? (
            <line
              x1={xAt(active)}
              x2={xAt(active)}
              y1={MARGIN.top}
              y2={MARGIN.top + PLOT_HEIGHT}
              className="stroke-border-strong"
              strokeWidth={1}
            />
          ) : null}
          {series.map((item, seriesIndex) => {
            const d = linePath(
              item.values.map((value, index) =>
                value === null ? null : { x: xAt(index), y: yAt(value) },
              ),
            );
            const common = {
              'data-series': item.key,
              d,
              fill: 'none',
              stroke: seriesColor(seriesIndex),
              strokeWidth: 2,
              strokeLinecap: 'round' as const,
              strokeLinejoin: 'round' as const,
            };
            return reduceMotion ? (
              <path key={item.key} {...common} />
            ) : (
              <m.path
                key={item.key}
                {...common}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={transitions.slow}
              />
            );
          })}
          {active !== null
            ? series.map((item, seriesIndex) => {
                const value = item.values[active];
                if (value === null || value === undefined) return null;
                return (
                  <circle
                    key={item.key}
                    cx={xAt(active)}
                    cy={yAt(value)}
                    r={MARKER_RADIUS}
                    fill={seriesColor(seriesIndex)}
                    stroke="var(--surface)"
                    strokeWidth={2}
                  />
                );
              })
            : null}
        </svg>
        <div role="status" className="pointer-events-none">
          {active !== null ? (
            <div
              className="absolute top-0 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-sm"
              style={{
                left: `${(xAt(active) / WIDTH) * 100}%`,
                transform: active > count / 2 ? 'translateX(-105%)' : 'translateX(5%)',
              }}
            >
              <div className="font-medium text-text">{labels[active]}</div>
              {series.map((item, seriesIndex) => {
                const value = item.values[active];
                return (
                  <div key={item.key} className="flex items-center gap-1.5 text-text-secondary">
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full"
                      style={{ backgroundColor: seriesColor(seriesIndex) }}
                    />
                    <span>{item.label}</span>
                    <span className="ml-auto pl-3 text-text tabular-nums">
                      {value === null || value === undefined ? '–' : formatValue(value)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
        {series.map((item, seriesIndex) => (
          <span key={item.key} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-0.5 w-4 rounded-full"
              style={{ backgroundColor: seriesColor(seriesIndex) }}
            />
            {item.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

export { LineChart };
export type { LineChartProps, LineSeries };
