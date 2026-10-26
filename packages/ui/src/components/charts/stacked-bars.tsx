'use client';

import { cn } from '@agency-os/ui/lib/utils';
import { m, transitions, useReducedMotion } from '@agency-os/ui/motion';

type StackedRow = {
  key: string;
  label: string;
  /** `label` names a segment that has no legend entry; its colour then follows its position in the row. */
  segments: Array<{ key: string; value: number; label?: string }>;
};

type StackedBarsProps = {
  rows: StackedRow[];
  /** Legend entries: segment key to display label; the key order fixes each segment's colour. */
  segmentLabels: Record<string, string>;
  formatValue: (value: number) => string;
  /** Plain-language description of the data, read by assistive technology. */
  summary: string;
  className?: string;
};

const total = (row: StackedRow) => row.segments.reduce((sum, segment) => sum + segment.value, 0);

/** One horizontal stacked bar per row; every bar shares the scale of the largest row. */
function StackedBars({ rows, segmentLabels, formatValue, summary, className }: StackedBarsProps) {
  const reduceMotion = useReducedMotion();
  const segmentKeys = Object.keys(segmentLabels);
  const colorOf = (key: string, position: number) => {
    const index = segmentKeys.indexOf(key);
    return `var(--chart-${((index >= 0 ? index : position) % 5) + 1})`;
  };
  const nameOf = (segment: { key: string; label?: string }) =>
    segment.label ?? segmentLabels[segment.key] ?? segment.key;
  const largest = Math.max(...rows.map(total), 0);

  return (
    <figure
      data-slot="stacked-bars"
      aria-label={summary}
      className={cn('flex flex-col gap-3', className)}
    >
      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <li
            key={row.key}
            data-row={row.key}
            className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3 text-sm"
          >
            <span className="truncate text-text">{row.label}</span>
            <div
              data-slot="bar-track"
              aria-hidden="true"
              className="flex h-3 gap-0.5 overflow-hidden rounded-sm bg-surface-muted"
            >
              {row.segments.map((segment, position) => {
                if (segment.value <= 0) return null;
                const width = Math.round((segment.value / largest) * 10000) / 100;
                const common = {
                  'data-segment': segment.key,
                  'data-width': String(width),
                  title: `${nameOf(segment)}: ${formatValue(segment.value)}`,
                  className: 'h-full rounded-sm',
                  style: { backgroundColor: colorOf(segment.key, position) },
                };
                return reduceMotion ? (
                  <div
                    key={segment.key}
                    {...common}
                    style={{ ...common.style, width: `${width}%` }}
                  />
                ) : (
                  <m.div
                    key={segment.key}
                    {...common}
                    initial={{ width: 0 }}
                    animate={{ width: `${width}%` }}
                    transition={transitions.slow}
                  />
                );
              })}
            </div>
            <span className="text-text tabular-nums">{formatValue(total(row))}</span>
            <span className="sr-only">
              {row.segments
                .map((segment) => `${nameOf(segment)}: ${formatValue(segment.value)}`)
                .join(', ')}
            </span>
          </li>
        ))}
      </ul>
      {segmentKeys.length > 0 ? (
        <figcaption>
          <ul
            data-slot="legend"
            className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary"
          >
            {segmentKeys.map((key) => (
              <li key={key} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-sm"
                  style={{ backgroundColor: colorOf(key, 0) }}
                />
                {segmentLabels[key]}
              </li>
            ))}
          </ul>
        </figcaption>
      ) : null}
    </figure>
  );
}

export { StackedBars };
export type { StackedBarsProps, StackedRow };
