import type { PaymentStep } from '@agency-os/db';
import { splitAmount, toMinorUnits } from '@/modules/contracts/domain/payments';

export type MilestoneDraft = { position: number; label: string; percent: number; amount: string };

export const BILLING_TIME_ZONE = 'Europe/Lisbon';

const DAY_MS = 24 * 60 * 60 * 1000;

const calendarDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: BILLING_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function fromMinorUnits(minor: bigint): string {
  const whole = minor / 100n;
  const fraction = minor % 100n;
  return `${whole}.${String(fraction).padStart(2, '0')}`;
}

export function buildMilestones(
  totalAmount: string,
  steps: readonly PaymentStep[],
): MilestoneDraft[] {
  const amounts = splitAmount(toMinorUnits(totalAmount), steps);
  return steps.map((step, index) => ({
    position: index + 1,
    label: step.label,
    percent: step.percent,
    amount: fromMinorUnits(amounts[index] ?? 0n),
  }));
}

/** The calendar date (YYYY-MM-DD) of an instant in Lisbon, where due dates are kept. */
export function lisbonDate(instant: Date): string {
  return calendarDate.format(instant);
}

export function dueDateFrom(sentAt: Date, days: number): string {
  const [year, month, day] = lisbonDate(sentAt).split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from one calendar date to another; negative when `to` comes first. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}
