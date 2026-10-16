export type RevenueRow = { currency: string; months: string[]; total: string };

const toCents = (amount: string): bigint => {
  const [whole = '0', fraction = ''] = amount.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2) || '0');
};

const fromCents = (cents: bigint): string =>
  `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;

/**
 * RF-131: reconciled payments of the year summed per month and currency, in cents so amounts
 * add up exactly; currencies in alphabetical order, months January to December.
 */
export function revenueByMonth(
  payments: readonly { receivedOn: string; amount: string; currency: string }[],
  year: number,
): RevenueRow[] {
  const byCurrency = new Map<string, bigint[]>();
  for (const payment of payments) {
    if (Number(payment.receivedOn.slice(0, 4)) !== year) continue;
    const months = byCurrency.get(payment.currency) ?? Array.from({ length: 12 }, () => 0n);
    const month = Number(payment.receivedOn.slice(5, 7)) - 1;
    months[month] = (months[month] ?? 0n) + toCents(payment.amount);
    byCurrency.set(payment.currency, months);
  }
  return [...byCurrency.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, months]) => ({
      currency,
      months: months.map(fromCents),
      total: fromCents(months.reduce((sum, value) => sum + value, 0n)),
    }));
}
