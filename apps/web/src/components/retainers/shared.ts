'use client';

import { useFormatter } from 'next-intl';

export type RetainerResult = { ok: true } | { ok: false; code: string };

export const SELECT =
  'h-9 rounded-md border border-border bg-surface px-2 text-body-sm text-text disabled:opacity-60';

const ERRORS = [
  'invalid_input',
  'invalid_state',
  'limit_reached',
  'not_found',
  'suspended',
] as const;
export type RetainerError = (typeof ERRORS)[number];

export const retainerError = (code: string): RetainerError =>
  ERRORS.find((known) => known === code) ?? 'not_found';

/** Quantities keep one decimal, shown in the reader's locale. */
export function useQuantity() {
  const format = useFormatter();
  return (value: number) => format.number(value, { maximumFractionDigits: 1 });
}

/** A typed amount or quantity with a decimal comma, as the forms send it. */
export const decimal = (value: string) => value.trim().replace(',', '.');
