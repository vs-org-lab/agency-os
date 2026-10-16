'use client';

import { useFormatter } from 'next-intl';

export type AcademyResult = { ok: true } | { ok: false; code: string };

const ERRORS = ['invalid_input', 'not_found'] as const;
export type AcademyError = (typeof ERRORS)[number];

export const academyError = (code: string): AcademyError =>
  ERRORS.find((known) => known === code) ?? 'not_found';

export const SELECT =
  'h-9 rounded-md border border-border bg-surface px-2 text-body-sm text-text disabled:opacity-60';

/** Non-empty trimmed lines of a textarea. */
export const linesOf = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

/** A calendar date (YYYY-MM-DD) or an instant as dd/mm/yyyy. */
export function useShortDate() {
  const format = useFormatter();
  const options = { day: '2-digit', month: '2-digit', year: 'numeric' } as const;
  return (value: string | Date) =>
    typeof value === 'string'
      ? format.dateTime(new Date(`${value}T12:00:00Z`), { ...options, timeZone: 'UTC' })
      : format.dateTime(value, options);
}
