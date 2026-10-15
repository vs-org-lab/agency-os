'use client';

import { useTranslations } from 'next-intl';
import type { LimitMonth } from '@/modules/retainers';
import { useQuantity } from './shared';

/** RF-111: each limit of the month, with what is used, the carry-over and what is left. */
export function LimitBars({ limits }: { limits: LimitMonth[] }) {
  const t = useTranslations('retainers');
  const quantity = useQuantity();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {limits.map((limit) => (
        <section
          key={limit.kind}
          aria-label={t(`kinds.${limit.kind}`)}
          className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="text-body-sm font-medium text-text">{t(`kinds.${limit.kind}`)}</h4>
            <span className="text-body-sm tabular-nums text-text">
              {t('usedOf', { used: quantity(limit.used), available: quantity(limit.available) })}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={t(`kinds.${limit.kind}`)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={limit.percent}
            className="h-2 overflow-hidden rounded-full bg-surface-muted"
          >
            <div
              className={
                limit.percent >= 100
                  ? 'h-full bg-danger'
                  : limit.percent >= 80
                    ? 'h-full bg-warning'
                    : 'h-full bg-primary'
              }
              style={{ width: `${Math.min(100, limit.percent)}%` }}
            />
          </div>
          <p className="text-caption text-text-secondary">
            {t('remaining', { remaining: quantity(limit.remaining) })}
          </p>
          {limit.carry > 0 ? (
            <p className="text-caption text-text-secondary">
              {t('carry', { carry: quantity(limit.carry) })}
            </p>
          ) : null}
        </section>
      ))}
    </div>
  );
}
