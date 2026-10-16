'use client';

import { useFormatter, useTranslations } from 'next-intl';
import type { ReportKind } from '@/modules/client-reports';

export type ReportResult = { ok: true } | { ok: false; code: string };

const ERRORS = ['invalid_input', 'invalid_period', 'exists', 'not_found'] as const;
export type ReportError = (typeof ERRORS)[number];

export const reportError = (code: string): ReportError =>
  ERRORS.find((known) => known === code) ?? 'not_found';

export const SELECT =
  'h-9 rounded-md border border-border bg-surface px-2 text-body-sm text-text disabled:opacity-60';

const calendarDay = (value: string) => new Date(`${value}T12:00:00Z`);

/** "setembro de 2026" for a month, "T3 2026" for a quarter, in the reader's locale. */
export function usePeriodLabel() {
  const t = useTranslations('clientReports');
  const format = useFormatter();
  return (kind: ReportKind, start: string) => {
    if (kind === 'qbr') {
      return t('quarter', {
        quarter: Math.floor((Number(start.slice(5, 7)) - 1) / 3) + 1,
        year: start.slice(0, 4),
      });
    }
    return format.dateTime(calendarDay(start), { month: 'long', year: 'numeric', timeZone: 'UTC' });
  };
}

/** A calendar date (YYYY-MM-DD) or an instant as dd/mm/yyyy. */
export function useShortDate() {
  const format = useFormatter();
  const options = { day: '2-digit', month: '2-digit', year: 'numeric' } as const;
  return (value: string | Date) =>
    typeof value === 'string'
      ? format.dateTime(calendarDay(value), { ...options, timeZone: 'UTC' })
      : format.dateTime(value, options);
}
