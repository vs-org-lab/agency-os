import { CURRENCIES, type Currency, type CurrencyTotals } from './summary';

export type BreakdownRequest = {
  clientName: string;
  amount: string;
  currency: Currency;
  status: 'sent' | 'paid' | 'void';
  sentAt: string;
};

export type AgeBucketId = 'current' | 'late' | 'overdue' | 'stale';

export type AgeBucket = { id: AgeBucketId; count: number; totals: CurrencyTotals };

export type ClientReceipts = { clientName: string; totals: CurrencyTotals; share: number };

/** Upper bound in days since sending, inclusive: up to 30, 60, 90 and beyond. */
const AGE_LIMITS: [AgeBucketId, number][] = [
  ['current', 30],
  ['late', 60],
  ['overdue', 90],
  ['stale', Number.POSITIVE_INFINITY],
];

const DAY_MS = 86_400_000;
const toCents = (amount: string) => Math.round(Number(amount) * 100);

function totalsOf(cents: Map<Currency, number>): CurrencyTotals {
  const totals: CurrencyTotals = {};
  for (const currency of CURRENCIES) {
    const value = cents.get(currency);
    if (value !== undefined) totals[currency] = (value / 100).toFixed(2);
  }
  return totals;
}

/** The open requests by days since they were sent, per currency and without conversion. */
export function openByAge(requests: readonly BreakdownRequest[], today: string): AgeBucket[] {
  const end = Date.parse(`${today}T23:59:59Z`);
  const buckets = AGE_LIMITS.map(([id]) => ({ id, count: 0, cents: new Map<Currency, number>() }));
  for (const request of requests) {
    if (request.status !== 'sent') continue;
    const days = Math.floor((end - Date.parse(request.sentAt)) / DAY_MS);
    const index = AGE_LIMITS.findIndex(([, limit]) => days <= limit);
    const bucket = buckets[index];
    if (!bucket) continue;
    bucket.count += 1;
    bucket.cents.set(
      request.currency,
      (bucket.cents.get(request.currency) ?? 0) + toCents(request.amount),
    );
  }
  return buckets.map(({ id, count, cents }) => ({ id, count, totals: totalsOf(cents) }));
}

/**
 * What each client paid, largest first by the euro total (then by the sum of every currency), with
 * each client's share of the largest so the screen can draw proportional bars.
 */
export function receivedByClient(requests: readonly BreakdownRequest[]): ClientReceipts[] {
  const byClient = new Map<string, Map<Currency, number>>();
  for (const request of requests) {
    if (request.status !== 'paid') continue;
    const cents = byClient.get(request.clientName) ?? new Map<Currency, number>();
    cents.set(request.currency, (cents.get(request.currency) ?? 0) + toCents(request.amount));
    byClient.set(request.clientName, cents);
  }
  const weight = (cents: Map<Currency, number>) =>
    cents.get('EUR') ?? [...cents.values()].reduce((sum, value) => sum + value, 0);
  const rows = [...byClient.entries()]
    .map(([clientName, cents]) => ({ clientName, cents, weight: weight(cents) }))
    .sort((a, b) => b.weight - a.weight || a.clientName.localeCompare(b.clientName));
  const largest = rows[0]?.weight ?? 0;
  return rows.map(({ clientName, cents, weight: value }) => ({
    clientName,
    totals: totalsOf(cents),
    share: largest > 0 ? Math.round((value / largest) * 1000) / 1000 : 0,
  }));
}
