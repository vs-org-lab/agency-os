'use client';

import { useFormatter, useTranslations } from 'next-intl';
import type { PortalOutcomeView } from '@/modules/outcomes';
import type { PortalRetainerView } from '@/modules/retainers';
import { useQuantity } from '@/components/retainers/shared';

const eyebrow = 'font-mono text-[11px] font-medium tracking-[0.12em] text-text-tertiary uppercase';

/** Share of the way from the baseline to the target, clamped to 0–100. */
export function outcomeProgress(baseline: number, target: number, latest: number | null): number {
  if (latest === null || target === baseline) return 0;
  const share = ((latest - baseline) / (target - baseline)) * 100;
  return Math.round(Math.min(100, Math.max(0, share)));
}

/**
 * The top of "Plano e resultado": where the agreed outcome stands and what is left of the
 * month's plan, before the detail below.
 */
export function ProgressSummary({
  outcome,
  retainer,
}: {
  outcome: PortalOutcomeView | null;
  retainer: PortalRetainerView | null;
}) {
  const t = useTranslations('portal.progress');
  const tKinds = useTranslations('retainers.kinds');
  const format = useFormatter();
  const quantity = useQuantity();
  const latest = outcome
    ? ([...outcome.measurements].sort((a, b) => b.measuredOn.localeCompare(a.measuredOn))[0] ??
      null)
    : null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {outcome ? (
        <section
          aria-labelledby="progress-outcome"
          className="rd-rise flex flex-col gap-3 rounded-lg border border-border bg-surface p-5"
        >
          <p className={eyebrow}>{t('outcome')}</p>
          <h2 id="progress-outcome" className="text-title-sm text-text">
            {outcome.outcome.metric}
          </h2>
          <div className="flex items-baseline gap-2">
            <span className="text-display font-semibold tracking-[-0.02em] text-text tabular-nums">
              {t('percent', {
                value: outcomeProgress(
                  outcome.outcome.baseline,
                  outcome.outcome.target,
                  latest?.value ?? null,
                ),
              })}
            </span>
            <span className="text-caption text-text-secondary">{t('ofTarget')}</span>
          </div>
          <p className="text-body-sm text-text-secondary">
            {t('range', {
              baseline: format.number(outcome.outcome.baseline),
              current: latest ? format.number(latest.value) : '—',
              target: format.number(outcome.outcome.target),
              unit: outcome.outcome.unit,
            })}
          </p>
          <p className="text-caption text-text-tertiary">
            {t('deadline', {
              date: format.dateTime(new Date(`${outcome.outcome.deadline}T12:00:00Z`), {
                dateStyle: 'medium',
              }),
            })}
          </p>
        </section>
      ) : null}
      {retainer ? (
        <section
          aria-labelledby="progress-retainer"
          className="rd-rise flex flex-col gap-3 rounded-lg border border-border bg-surface p-5"
        >
          <p className={eyebrow}>{t('month')}</p>
          <h2 id="progress-retainer" className="text-title-sm text-text">
            {t('tier', { tier: retainer.retainer.tier })}
          </h2>
          <ul className="flex flex-col gap-2">
            {retainer.limits.map((limit) => (
              <li key={limit.kind} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3 text-body-sm">
                  <span className="text-text">{tKinds(limit.kind)}</span>
                  <span className="text-text-secondary tabular-nums">
                    {t('left', {
                      remaining: quantity(limit.remaining),
                      available: quantity(limit.available),
                    })}
                  </span>
                </div>
                <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-border">
                  <span
                    className="block h-full rounded-full bg-brand"
                    style={{ width: `${Math.min(100, limit.percent)}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
          <p className="text-caption text-text-tertiary">
            {t('renews', { days: retainer.period.left })}
          </p>
        </section>
      ) : null}
    </div>
  );
}
