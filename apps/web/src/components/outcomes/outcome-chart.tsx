'use client';

import { useFormatter, useTranslations } from 'next-intl';
import type { MeasurementView } from '@/modules/outcomes';
import { useMetric } from './shared';

const WIDTH = 640;
const HEIGHT = 220;
const PAD = { top: 16, right: 16, bottom: 16, left: 16 };

/**
 * RF-122: the metric's values over time against the baseline and the target, as an SVG described
 * for assistive technology and followed by the table of the same values.
 */
export function OutcomeChart({
  metric,
  unit,
  baseline,
  target,
  measurements,
}: {
  metric: string;
  unit: string;
  baseline: number;
  target: number;
  measurements: readonly MeasurementView[];
}) {
  const t = useTranslations('outcomes.chart');
  const format = useFormatter();
  const value = useMetric();
  const values = measurements.map((measurement) => measurement.value);
  const low = Math.min(baseline, target, ...values);
  const high = Math.max(baseline, target, ...values);
  const span = high - low || 1;
  const y = (point: number) =>
    PAD.top + (1 - (point - low) / span) * (HEIGHT - PAD.top - PAD.bottom);
  const times = measurements.map((measurement) =>
    Date.parse(`${measurement.measuredOn}T12:00:00Z`),
  );
  const first = Math.min(...times);
  const last = Math.max(...times);
  const x = (time: number) =>
    measurements.length < 2 || last === first
      ? WIDTH / 2
      : PAD.left + ((time - first) / (last - first)) * (WIDTH - PAD.left - PAD.right);
  const points = measurements.map((measurement, index) => ({
    key: measurement.measuredOn,
    x: x(times[index] ?? first),
    y: y(measurement.value),
  }));
  const label = t('label', { metric, baseline: value(baseline), target: value(target) });

  return (
    <figure className="flex flex-col gap-3">
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full rounded-lg border border-border bg-surface"
      >
        <line
          x1={PAD.left}
          x2={WIDTH - PAD.right}
          y1={y(baseline)}
          y2={y(baseline)}
          className="stroke-border"
          strokeDasharray="4 4"
          strokeWidth={1.5}
        />
        <line
          x1={PAD.left}
          x2={WIDTH - PAD.right}
          y1={y(target)}
          y2={y(target)}
          className="stroke-success"
          strokeDasharray="6 3"
          strokeWidth={1.5}
        />
        {points.length > 1 ? (
          <polyline
            points={points.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            className="stroke-accent"
            strokeWidth={2}
          />
        ) : null}
        {points.map((point) => (
          <circle key={point.key} cx={point.x} cy={point.y} r={4} className="fill-accent" />
        ))}
      </svg>
      <figcaption className="flex flex-wrap gap-4 text-caption text-text-secondary">
        <span>{t('baselineValue', { value: `${value(baseline)} ${unit}`.trim() })}</span>
        <span>{t('targetValue', { value: `${value(target)} ${unit}`.trim() })}</span>
      </figcaption>
      {measurements.length === 0 ? (
        <p className="text-body-sm text-text-secondary">{t('empty')}</p>
      ) : (
        <table className="w-full text-left text-body-sm">
          <thead>
            <tr className="border-b border-border text-text-secondary">
              <th scope="col" className="py-1 font-medium">
                {t('date')}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {t('value')}
              </th>
            </tr>
          </thead>
          <tbody>
            {measurements.map((measurement) => (
              <tr key={measurement.measuredOn} className="border-b border-border last:border-b-0">
                <td className="py-1 text-text">
                  {format.dateTime(new Date(`${measurement.measuredOn}T12:00:00Z`), {
                    dateStyle: 'medium',
                    timeZone: 'UTC',
                  })}
                </td>
                <td className="py-1 text-right tabular-nums text-text">
                  {value(measurement.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}
