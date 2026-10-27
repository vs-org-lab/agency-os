const lisbonDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' });

/** The first day (YYYY-MM-01) of the Lisbon month an instant falls in. */
export function currentMonth(now: Date = new Date()): string {
  return `${lisbonDate.format(now).slice(0, 7)}-01`;
}

/** The first days of the `count` months up to and including `month`, oldest first. */
export function monthsUpTo(month: string, count: number): string[] {
  const [year, index] = month.split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, offset) =>
    new Date(Date.UTC(year, index - count + offset, 1)).toISOString().slice(0, 10),
  );
}

/** Whether a value is the first day of a month written as YYYY-MM-01. */
export function isMonth(value: string): boolean {
  if (!/^\d{4}-\d{2}-01$/.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}
