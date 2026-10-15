/** Share of the monthly limit that may carry over to the next month (RN-60). */
export const CARRY_SHARE = 0.2;
export const ALERT_THRESHOLDS = [80, 100] as const;
export type AlertThreshold = (typeof ALERT_THRESHOLDS)[number];

/** Retainer quantities keep one decimal; they are added in tenths to avoid float drift. */
const tenths = (value: number) => Math.round(value * 10);
const fromTenths = (value: number) => value / 10;

/**
 * RN-60: the month's allowance is the limit plus up to 20% of what was left unused of the limit
 * in the previous month only, never compounded. The first month has no carry. Usage paid by an
 * extra request must not be included in `usedLastMonth`.
 */
export function allowance(input: { limit: number; usedLastMonth: number; firstMonth: boolean }): {
  carry: number;
  available: number;
} {
  const limit = tenths(input.limit);
  const unused = Math.max(0, limit - tenths(input.usedLastMonth));
  const carry = input.firstMonth ? 0 : Math.min(Math.round(limit * CARRY_SHARE), unused);
  return { carry: fromTenths(carry), available: fromTenths(limit + carry) };
}

export function limitState(input: { limit: number; carry: number; used: number }): {
  available: number;
  used: number;
  remaining: number;
  percent: number;
} {
  const available = tenths(input.limit) + tenths(input.carry);
  const used = tenths(input.used);
  return {
    available: fromTenths(available),
    used: fromTenths(used),
    remaining: fromTenths(Math.max(0, available - used)),
    percent: available === 0 ? 0 : Math.round((used / available) * 100),
  };
}

/** AUT-22: the thresholds one new entry crosses, from the usage before to the usage after. */
export function crossedThresholds(
  before: number,
  after: number,
  available: number,
): AlertThreshold[] {
  if (available <= 0) return [];
  const share = (value: number) => (tenths(value) * 100) / tenths(available);
  return ALERT_THRESHOLDS.filter(
    (threshold) => share(before) < threshold && share(after) >= threshold,
  );
}
