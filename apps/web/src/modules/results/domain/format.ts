import type { KpiFormat } from '../readers';

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

/** A KPI value as the reader writes it: thousands, decimals, %, € or ×. */
export function formatKpi(value: number, format: KpiFormat, locale: string): string {
  if (format === 'currency') {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    })
      .format(value)
      .replace(/\s/g, ' ');
  }
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
    .format(value)
    .replace(/\s/g, ' ');
  if (format === 'percent') return `${number}%`;
  if (format === 'ratio') return `${number}×`;
  return number;
}

export type KpiChange = {
  direction: 'up' | 'down' | 'flat';
  amount: number;
  /** Counts change in percent, percentages in points and ratios in their own value. */
  unit: 'percent' | 'points' | 'value';
};

/** How the value moved against the previous month; null when there is nothing to compare. */
export function kpiChange(
  current: number,
  previous: number | null,
  format: KpiFormat,
): KpiChange | null {
  if (previous === null) return null;
  const difference = current - previous;
  const direction = difference > 0 ? 'up' : difference < 0 ? 'down' : 'flat';
  if (format === 'percent')
    return { direction, amount: round(Math.abs(difference), 2), unit: 'points' };
  if (format === 'ratio')
    return { direction, amount: round(Math.abs(difference), 2), unit: 'value' };
  if (previous === 0) return null;
  return {
    direction,
    amount: round(Math.abs(difference / previous) * 100, 1),
    unit: 'percent',
  };
}

/** Whether the target is met, and the share of it reached (capped at 1). */
export function kpiStanding(
  value: number,
  target: number | null,
): { met: boolean; share: number } | null {
  if (target === null || target === 0) return null;
  const share = round(Math.min(value / target, 1), 2);
  return { met: value >= target, share };
}
