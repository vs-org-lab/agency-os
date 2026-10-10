import type { PaymentStep } from '@agency-os/db';
import { splitAmount, toMinorUnits } from '@/modules/contracts';

export type MilestoneDraft = { position: number; label: string; percent: number; amount: string };

export type MilestoneTrigger = 'signature' | 'phase_approval' | 'delivery';

/** The first milestone is paid at signature, the last at delivery and the rest on phase approvals. */
export function milestoneTriggers(count: number): MilestoneTrigger[] {
  return Array.from({ length: count }, (_, index) => {
    if (index === 0) return 'signature';
    return index === count - 1 ? 'delivery' : 'phase_approval';
  });
}

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

/** One milestone per plan step; steps whose share rounds to zero are left out. */
export function buildMilestones(
  totalAmount: string,
  steps: readonly PaymentStep[],
): MilestoneDraft[] {
  const amounts = splitAmount(toMinorUnits(totalAmount), steps);
  return steps
    .map((step, index) => ({
      position: index + 1,
      label: step.label,
      percent: step.percent,
      minor: amounts[index] ?? 0n,
    }))
    .filter((draft) => draft.minor > 0n)
    .map(({ minor, ...draft }) => ({ ...draft, amount: fromMinorUnits(minor) }));
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
