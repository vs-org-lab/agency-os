import type { KpiAggregation, KpiFormat } from '@/modules/results';
import type { ReportPeriod } from './periods';

/** An indicator as the report shows it: the period's figure next to the period before. */
export type ReportIndicator = {
  name: string;
  format: KpiFormat;
  source: string;
  target: number | null;
  current: number | null;
  previous: number | null;
};

export type IndicatorDefinition = {
  id: string;
  name: string;
  format: KpiFormat;
  aggregation: KpiAggregation;
  source: string;
  target: number | null;
};

export type IndicatorValue = { kpiId: string; month: string; value: number };

const monthIndex = (day: string) => Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1;

function aggregate(values: number[], aggregation: KpiAggregation): number | null {
  if (values.length === 0) return null;
  if (aggregation === 'last') return values[values.length - 1] ?? null;
  const total = values.reduce((sum, value) => sum + value, 0);
  const result = aggregation === 'average' ? total / values.length : total;
  return Math.round(result * 10_000) / 10_000;
}

/**
 * Each indicator over the report's period and the period of the same length before it, combined
 * by the indicator's own rule. Indicators without a value in either period stay out.
 */
export function reportIndicators(
  definitions: readonly IndicatorDefinition[],
  values: readonly IndicatorValue[],
  period: ReportPeriod,
): ReportIndicator[] {
  const start = monthIndex(period.start);
  const length = monthIndex(period.end) - start + 1;
  const sorted = [...values].sort((a, b) => a.month.localeCompare(b.month));

  return definitions.flatMap((definition) => {
    const window = (from: number) =>
      sorted
        .filter((entry) => entry.kpiId === definition.id)
        .filter((entry) => {
          const index = monthIndex(entry.month);
          return index >= from && index < from + length;
        })
        .map((entry) => entry.value);
    const current = aggregate(window(start), definition.aggregation);
    const previous = aggregate(window(start - length), definition.aggregation);
    if (current === null && previous === null) return [];
    return [
      {
        name: definition.name,
        format: definition.format,
        source: definition.source,
        target: definition.target,
        current,
        previous,
      },
    ];
  });
}
