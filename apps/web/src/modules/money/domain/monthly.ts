import type { Currency } from './summary';

export type DateRange = { from: string; to: string };

type RequestLike = { sentAt: string; amount: string; currency: Currency; status: string };
type ExpenseLike = { spentOn: string; amount: string; currency: Currency };

const LISBON_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Lisbon',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `yyyy-MM-dd` of an instant on the Lisbon calendar. */
const lisbonDay = (instant: string): string => LISBON_DAY.format(new Date(instant));

const toCents = (amount: string): number => Math.round(Number(amount) * 100);

/** Paid requests and expenses in EUR for each month of the year; other currencies are only flagged. */
export function monthlyTotals(
  requests: RequestLike[],
  expenses: ExpenseLike[],
): { received: number[]; spent: number[]; otherCurrencies: boolean } {
  const received = new Array<number>(12).fill(0);
  const spent = new Array<number>(12).fill(0);
  let otherCurrencies = false;

  const add = (target: number[], day: string, amount: string) => {
    const month = Number(day.slice(5, 7)) - 1;
    target[month] = (target[month] ?? 0) + toCents(amount);
  };

  for (const request of requests) {
    if (request.status !== 'paid') continue;
    if (request.currency !== 'EUR') otherCurrencies = true;
    else add(received, lisbonDay(request.sentAt), request.amount);
  }
  for (const expense of expenses) {
    if (expense.currency !== 'EUR') otherCurrencies = true;
    else add(spent, expense.spentOn, expense.amount);
  }

  return {
    received: received.map((cents) => cents / 100),
    spent: spent.map((cents) => cents / 100),
    otherCurrencies,
  };
}

/** Keeps the requests sent and the expenses made inside the inclusive range (Lisbon days). */
export function filterByRange<R extends { sentAt: string }, E extends { spentOn: string }>(
  requests: R[],
  expenses: E[],
  range: DateRange | null,
): { requests: R[]; expenses: E[] } {
  if (!range) return { requests, expenses };
  const inside = (day: string) => day >= range.from && day <= range.to;
  return {
    requests: requests.filter((request) => inside(lisbonDay(request.sentAt))),
    expenses: expenses.filter((expense) => inside(expense.spentOn)),
  };
}

function isRealDay(value: string | undefined): value is string {
  const match = value ? ISO_DAY.exec(value) : null;
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** A usable range is two real days, in order, both inside the year; anything else is ignored. */
export function parseRange(
  from: string | undefined,
  to: string | undefined,
  year: number,
): DateRange | null {
  if (!isRealDay(from) || !isRealDay(to) || from > to) return null;
  const prefix = `${year}-`;
  if (!from.startsWith(prefix) || !to.startsWith(prefix)) return null;
  return { from, to };
}

export type RangePresetId = 'month' | 'quarter' | 'year';

const pad = (value: number) => String(value).padStart(2, '0');
const lastDayOf = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Today on the Lisbon calendar, as an ISO day. */
export const lisbonToday = (): string => lisbonDay(new Date().toISOString());

const monthStart = (year: number, month: number) => `${year}-${pad(month)}-01`;
const monthEnd = (year: number, month: number) =>
  `${year}-${pad(month)}-${pad(lastDayOf(year, month))}`;

/** Quick ranges relative to today; only the ones that fall inside the viewed year are offered. */
export function rangePresets(
  today: string,
  year: number,
): Array<{ id: RangePresetId; from: string; to: string }> {
  const presets: Array<{ id: RangePresetId; from: string; to: string }> = [];
  const month = Number(today.slice(5, 7));

  if (Number(today.slice(0, 4)) === year) {
    presets.push({ id: 'month', from: monthStart(year, month), to: monthEnd(year, month) });
    const quarter = Math.floor((month - 1) / 3);
    if (quarter > 0) {
      presets.push({
        id: 'quarter',
        from: monthStart(year, quarter * 3 - 2),
        to: monthEnd(year, quarter * 3),
      });
    }
  }
  presets.push({ id: 'year', from: monthStart(year, 1), to: monthEnd(year, 12) });
  return presets;
}
