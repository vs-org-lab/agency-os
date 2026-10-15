'use client';

import { useId } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import type { ClientHealthView, Signal } from '@/modules/health';

const SIGNALS = ['payments', 'approvals', 'responses', 'outcome'] as const;

const LEVEL_VARIANT = {
  healthy: 'secondary',
  attention: 'outline',
  at_risk: 'destructive',
} as const;

/** RF-160 on C-01: the client's health score, its level and the four signals behind it. */
export function HealthCard({ health }: { health: ClientHealthView }) {
  const t = useTranslations('health');
  const format = useFormatter();
  const headingId = useId();
  const detail = (signal: Signal) => {
    const value = signal.detail;
    switch (value.kind) {
      case 'payments':
        return t('details.payments', { onTime: value.onTime, total: value.total });
      case 'approvals':
        return t('details.approvals', {
          days: format.number(value.medianDays, { maximumFractionDigits: 1 }),
        });
      case 'responses':
        return t('details.responses', { hours: Math.round(value.medianHours) });
      case 'outcome':
        return t('details.outcome', {
          progress: Math.round(value.progress * 100),
          expected: Math.round(value.expected * 100),
        });
    }
  };

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
      aria-labelledby={headingId}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-body font-medium text-text">
          {t('title')}
        </h2>
        {health.score === null || health.level === null ? (
          <span className="text-body-sm text-text-secondary">{t('noData')}</span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="text-body font-medium tabular-nums text-text">
              {t('score', { score: health.score })}
            </span>
            <Badge variant={LEVEL_VARIANT[health.level]}>{t(`levels.${health.level}`)}</Badge>
          </span>
        )}
      </div>
      <ul className="flex flex-col">
        {SIGNALS.map((key) => {
          const signal = health.signals[key];
          return (
            <li
              key={key}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-body-sm last:border-b-0"
            >
              <span className="text-text">{t(`signals.${key}`)}</span>
              <span className="text-text-secondary">{signal ? detail(signal) : t('noData')}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
