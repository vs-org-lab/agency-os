/** A calendar date (YYYY-MM-DD) as a Date that formats to the same day in any time zone. */
export function calendarDate(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}
