/** RN-72: the guarantee covers at most 3 months of work. */
export const GUARANTEE_MONTHS = 3;

function parts(date: string): [number, number, number] {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return [year, month, day];
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Whole calendar months from the activation date to today, capped at 3. A month is complete on the
 * same day of a later month, or on its last day when that month is shorter.
 */
export function fullMonthsSince(activatedOn: string, today: string): number {
  const [fromYear, fromMonth, fromDay] = parts(activatedOn);
  const [toYear, toMonth, toDay] = parts(today);
  let months = (toYear - fromYear) * 12 + (toMonth - fromMonth);
  if (toDay < fromDay && toDay !== lastDayOfMonth(toYear, toMonth)) months -= 1;
  return Math.min(GUARANTEE_MONTHS, Math.max(0, months));
}
