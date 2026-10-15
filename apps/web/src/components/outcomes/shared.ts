'use client';

import { useFormatter } from 'next-intl';

export type OutcomeResult = { ok: true } | { ok: false; code: string };

export const SELECT =
  'h-9 rounded-md border border-border bg-surface px-2 text-body-sm text-text disabled:opacity-60';

const ERRORS = ['invalid_input', 'invalid_state', 'not_found'] as const;
export type OutcomeError = (typeof ERRORS)[number];

export const outcomeError = (code: string): OutcomeError =>
  ERRORS.find((known) => known === code) ?? 'not_found';

/** A typed number with a decimal comma, as the forms send it. */
export const decimal = (value: string) => value.trim().replace(',', '.');

/** Metric values keep up to two decimals, shown in the reader's locale. */
export function useMetric() {
  const format = useFormatter();
  return (value: number) => format.number(value, { maximumFractionDigits: 2 });
}

/** A calendar date (YYYY-MM-DD) in the reader's locale, as a long date. */
export function useLongDate() {
  const format = useFormatter();
  return (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00Z`), { dateStyle: 'long', timeZone: 'UTC' });
}
