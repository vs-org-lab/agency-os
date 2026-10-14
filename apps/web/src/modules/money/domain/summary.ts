export const CURRENCIES = ['EUR', 'GBP', 'USD', 'AOA'] as const;
export type Currency = (typeof CURRENCIES)[number];

export type Money = { amount: string; currency: Currency };

/** Totals of one kind of movement, only for the currencies that have any, with two decimals. */
export type CurrencyTotals = Partial<Record<Currency, string>>;

export type YearSummary = { received: CurrencyTotals; open: CurrencyTotals; spent: CurrencyTotals };

const toCents = (amount: string): number => Math.round(Number(amount) * 100);

function total(entries: Money[]): CurrencyTotals {
  const cents = new Map<Currency, number>();
  for (const entry of entries) {
    cents.set(entry.currency, (cents.get(entry.currency) ?? 0) + toCents(entry.amount));
  }
  const totals: CurrencyTotals = {};
  for (const currency of CURRENCIES) {
    const value = cents.get(currency);
    if (value !== undefined) totals[currency] = (value / 100).toFixed(2);
  }
  return totals;
}

/** RF-150: what came in, what is open and what went out, per currency and without conversion. */
export function summarise(input: {
  received: Money[];
  open: Money[];
  spent: Money[];
}): YearSummary {
  return { received: total(input.received), open: total(input.open), spent: total(input.spent) };
}

const LISBON_YEAR = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Lisbon',
  year: 'numeric',
});

export function lisbonYear(now: Date): number {
  return Number(LISBON_YEAR.format(now));
}

export function yearBounds(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}
