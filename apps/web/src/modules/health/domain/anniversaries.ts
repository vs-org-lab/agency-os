/** Days back the renewal sweep looks, so a missed day is caught up. */
export const RENEWAL_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

function anniversary(signedOn: string, year: number): string {
  const [signedYear, month, day] = signedOn.split('-').map(Number) as [number, number, number];
  const targetYear = signedYear + year;
  const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
  const date = new Date(Date.UTC(targetYear, month - 1, Math.min(day, lastDay)));
  return date.toISOString().slice(0, 10);
}

/**
 * AUT-29: the years of partnership whose anniversary fell within the last 7 days, today
 * included. A partnership started on 29 February has its anniversary on the 28th in other years.
 */
export function renewalsDue(firstSignedOn: string, today: string): { year: number; on: string }[] {
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - RENEWAL_WINDOW_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const years = Number(today.slice(0, 4)) - Number(firstSignedOn.slice(0, 4));
  const due: { year: number; on: string }[] = [];
  for (let year = 1; year <= years; year += 1) {
    const on = anniversary(firstSignedOn, year);
    if (on > from && on <= today) due.push({ year, on });
  }
  return due;
}
