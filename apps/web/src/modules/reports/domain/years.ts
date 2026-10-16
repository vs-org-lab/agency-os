export const FIRST_REPORT_YEAR = 2000;
export const LAST_REPORT_YEAR = 2100;

/**
 * The year a report is asked for: none means the current one; anything that is not a whole year
 * between 2000 and 2100 is no report at all.
 */
export function reportYear(value: string | null | undefined, currentYear: number): number | null {
  if (value === null || value === undefined || value === '') return currentYear;
  if (!/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return year >= FIRST_REPORT_YEAR && year <= LAST_REPORT_YEAR ? year : null;
}
