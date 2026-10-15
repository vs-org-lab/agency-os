export type SubscriptionCycle = 'monthly' | 'annual';
export type RenewalState = 'overdue' | 'soon' | 'later';

/** Renewals within this many days are highlighted. */
export const RENEWAL_SOON_DAYS = 7;

const DAY_MS = 86_400_000;

function parts(date: string): [number, number, number] {
  const [year, month, day] = date.split('-').map(Number);
  return [year ?? 0, month ?? 1, day ?? 1];
}

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/** The date one cycle later, kept to the last day of a shorter month. */
export function nextRenewal(date: string, cycle: SubscriptionCycle): string {
  const [year, month, day] = parts(date);
  const months = cycle === 'monthly' ? 1 : 12;
  const index = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  return iso(nextYear, nextMonth, Math.min(day, lastDay));
}

export function renewalState(nextRenewalOn: string, today: string): RenewalState {
  const days = (Date.parse(nextRenewalOn) - Date.parse(today)) / DAY_MS;
  if (days < 0) return 'overdue';
  return days <= RENEWAL_SOON_DAYS ? 'soon' : 'later';
}
