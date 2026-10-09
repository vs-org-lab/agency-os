import type { PaymentStep } from '@agency-os/db';

export const MAX_PAYMENT_STEPS = 6;

export function validatePaymentPlan(steps: readonly PaymentStep[]): boolean {
  if (steps.length === 0 || steps.length > MAX_PAYMENT_STEPS) return false;
  const valid = steps.every(
    (step) =>
      step.label.trim().length > 0 &&
      step.label.length <= 80 &&
      Number.isInteger(step.percent) &&
      step.percent >= 1 &&
      step.percent <= 100,
  );
  return valid && steps.reduce((sum, step) => sum + step.percent, 0) === 100;
}

/** Splits an amount in minor units by percentage; the last step absorbs the rounding remainder. */
export function splitAmount(totalMinor: bigint, steps: readonly PaymentStep[]): bigint[] {
  const parts = steps.map((step) => (totalMinor * BigInt(step.percent)) / 100n);
  const assigned = parts.reduce((sum, part) => sum + part, 0n);
  const last = parts.length - 1;
  if (last >= 0) parts[last] = (parts[last] ?? 0n) + totalMinor - assigned;
  return parts;
}

export function toMinorUnits(decimal: string): bigint {
  const [whole = '0', fraction = ''] = decimal.trim().split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
}
