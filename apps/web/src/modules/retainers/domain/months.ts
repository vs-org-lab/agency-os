const LISBON_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Lisbon',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** A month is stored as its first day, YYYY-MM-01. */
export function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function previousMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const index = (year ?? 0) * 12 + ((monthNumber ?? 1) - 1) - 1;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`;
}

export function lisbonDay(now: Date): string {
  return LISBON_DAY.format(now);
}

export function lisbonMonth(now: Date): string {
  return firstOfMonth(lisbonDay(now));
}

/** The day of the Lisbon month, its length and the days left until it closes. */
export function monthProgress(now: Date): { day: number; total: number; left: number } {
  const [year, month, day] = lisbonDay(now).split('-').map(Number) as [number, number, number];
  const total = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { day, total, left: total - day };
}
