'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { CURRENCIES, type CurrencyTotals, type YearSummary } from '@/modules/money';

/** Joins the small facts under a row's title. */
export const DETAIL_SEPARATOR = ' · ';

export const SELECT =
  'h-9 rounded-md border border-border bg-surface px-2 text-body-sm text-text disabled:opacity-60';

export function useMoneyFormat() {
  const format = useFormatter();
  return (amount: string, currency: string) =>
    format.number(Number(amount), { style: 'currency', currency });
}

function Totals({ title, totals }: { title: string; totals: CurrencyTotals }) {
  const t = useTranslations('money.summary');
  const money = useMoneyFormat();
  const lines = CURRENCIES.filter((currency) => totals[currency] !== undefined);
  return (
    <section aria-label={title} className="flex flex-col gap-1.5 px-5 py-4">
      <h2 className="text-caption font-medium text-text-tertiary">{title}</h2>
      {lines.length === 0 ? (
        <p className="text-body-sm text-text-secondary">{t('none')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {lines.map((currency) => (
            <li
              key={currency}
              className="text-display font-semibold tracking-[-0.02em] text-text tabular-nums"
            >
              {money(totals[currency] ?? '0', currency)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** RF-150: what came in, what is open and what went out in the year, one line per currency. */
export function MoneySummary({ summary }: { summary: YearSummary }) {
  const t = useTranslations('money.summary');
  return (
    <div className="rd-rise grid divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <Totals title={t('received')} totals={summary.received} />
      <Totals title={t('open')} totals={summary.open} />
      <Totals title={t('spent')} totals={summary.spent} />
    </div>
  );
}
