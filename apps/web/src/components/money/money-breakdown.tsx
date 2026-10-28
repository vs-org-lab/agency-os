'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@agency-os/ui/lib/utils';
import {
  CURRENCIES,
  openByAge,
  receivedByClient,
  type CurrencyTotals,
  type MoneyRequestRow,
} from '@/modules/money';
import { DETAIL_SEPARATOR, useMoneyFormat } from './money-summary';

const AGE_TONE = {
  current: 'bg-text',
  late: 'bg-text-secondary',
  overdue: 'bg-warning',
  stale: 'bg-danger',
} as const;

function useTotals() {
  const money = useMoneyFormat();
  return (totals: CurrencyTotals) =>
    CURRENCIES.filter((currency) => totals[currency] !== undefined)
      .map((currency) => money(totals[currency] ?? '0', currency))
      .join(DETAIL_SEPARATOR);
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className="rd-rise flex flex-col gap-4 rounded-lg border border-border bg-surface p-5"
    >
      <h2 className="text-label text-text">{title}</h2>
      {children}
    </section>
  );
}

/** Below the year's totals: what is still open by age, and who paid what. */
export function MoneyBreakdown({
  requests,
  today,
}: {
  requests: MoneyRequestRow[];
  today: string;
}) {
  const t = useTranslations('money.breakdown');
  const totals = useTotals();
  const ages = openByAge(requests, today);
  const clients = receivedByClient(requests);
  const open = ages.some((bucket) => bucket.count > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title={t('ageTitle')}>
        {open ? (
          <ul className="flex flex-col divide-y divide-border">
            {ages.map((bucket) => (
              <li key={bucket.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span
                  aria-hidden
                  className={cn(
                    'size-2 rounded-full',
                    bucket.count > 0 ? AGE_TONE[bucket.id] : 'bg-border',
                  )}
                />
                <span className="flex-1 text-body-sm text-text">{t(`ages.${bucket.id}`)}</span>
                <span className="text-caption text-text-tertiary">
                  {t('count', { count: bucket.count })}
                </span>
                <span className="min-w-28 text-right text-body-sm font-medium tabular-nums text-text">
                  {bucket.count > 0 ? totals(bucket.totals) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-text-secondary">{t('ageEmpty')}</p>
        )}
      </Panel>
      <Panel title={t('clientsTitle')}>
        {clients.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {clients.slice(0, 8).map((client) => (
              <li key={client.clientName} className="flex flex-col gap-1.5">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-body-sm text-text">{client.clientName}</span>
                  <span className="text-body-sm font-medium tabular-nums text-text">
                    {totals(client.totals)}
                  </span>
                </span>
                <span aria-hidden className="h-1 overflow-hidden rounded-full bg-surface-muted">
                  <span
                    className="block h-full rounded-full bg-text transition-[width] duration-500 ease-out"
                    style={{ width: `${Math.max(client.share * 100, 2)}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-text-secondary">{t('clientsEmpty')}</p>
        )}
      </Panel>
    </div>
  );
}
