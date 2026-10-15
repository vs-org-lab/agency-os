'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import type { PortalOutcomeView } from '@/modules/outcomes';
import { useConditionStatus } from './conditions';
import { GuaranteeCard } from './guarantee-card';
import { OutcomeChart } from './outcome-chart';
import { useLongDate, useMetric } from './shared';

/** P-10: the agreed outcome as the client sees it, with its progress, conditions and guarantee. */
export function PortalOutcome({ view }: { view: PortalOutcomeView }) {
  const t = useTranslations('outcomes');
  const metric = useMetric();
  const longDate = useLongDate();
  const statusText = useConditionStatus();
  const outcome = view.outcome;

  return (
    <section className="flex flex-col gap-6" aria-label={t('portal.title')}>
      <div className="flex flex-col gap-1">
        <h2 className="text-title-sm text-text">{t('portal.title')}</h2>
        <p className="text-body-sm text-text-secondary">
          {t('summary', {
            metric: outcome.metric,
            baseline: `${metric(outcome.baseline)} ${outcome.unit}`.trim(),
            target: `${metric(outcome.target)} ${outcome.unit}`.trim(),
            deadline: longDate(outcome.deadline),
          })}
        </p>
        <p className="text-caption text-text-tertiary">
          {t('source', { source: outcome.dataSource })}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="text-body font-medium text-text">{t('evolution')}</h3>
        <OutcomeChart
          metric={outcome.metric}
          unit={outcome.unit}
          baseline={outcome.baseline}
          target={outcome.target}
          measurements={view.measurements}
        />
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="text-body font-medium text-text">{t('conditions.title')}</h3>
        <ul className="flex flex-col">
          {view.conditions.map((condition) => (
            <li
              key={condition.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 last:border-b-0"
            >
              <span className="text-body-sm text-text">{condition.description}</span>
              <Badge variant={condition.status === 'failed' ? 'destructive' : 'outline'}>
                {statusText(condition)}
              </Badge>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="text-body font-medium text-text">{t('guarantee.title')}</h3>
        <GuaranteeCard guarantee={outcome.guarantee} deadline={outcome.deadline} />
      </div>
    </section>
  );
}
