'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { useRouter } from '@/i18n/navigation';
import type { StaffOutcomeView } from '@/modules/outcomes';
import { Conditions, type AddCondition, type RecordCondition } from './conditions';
import { GuaranteeCard } from './guarantee-card';
import { MeasurementForm, type RecordMeasurement } from './measurements';
import { OutcomeChart } from './outcome-chart';
import { OutcomeForm, type SaveOutcome } from './outcome-form';
import { useLongDate, useMetric, type OutcomeResult } from './shared';

export type OutcomeActions = {
  save: SaveOutcome;
  addCondition: AddCondition;
  recordCondition: RecordCondition;
  recordMeasurement: RecordMeasurement;
};

function refreshing<A extends unknown[]>(
  run: (...args: A) => Promise<OutcomeResult>,
  refresh: () => void,
): (...args: A) => Promise<OutcomeResult> {
  return async (...args) => {
    const result = await run(...args);
    if (result.ok) refresh();
    return result;
  };
}

/** C-11: the agreed outcome, its progress, the client conditions and the guarantee. */
export function OutcomeScreen({
  clientId,
  view,
  actions,
}: {
  clientId: string;
  view: StaffOutcomeView;
  actions: OutcomeActions;
}) {
  const t = useTranslations('outcomes');
  const router = useRouter();
  const refresh = () => router.refresh();
  const metric = useMetric();
  const longDate = useLongDate();
  const [editing, setEditing] = useState(false);
  const outcome = view.outcome;

  return (
    <div className="flex w-full flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-title-sm text-text">{t('title')}</h2>
          {outcome ? (
            <>
              <p className="text-body text-text-secondary">
                {t('summary', {
                  metric: outcome.metric,
                  baseline: `${metric(outcome.baseline)} ${outcome.unit}`.trim(),
                  target: `${metric(outcome.target)} ${outcome.unit}`.trim(),
                  deadline: longDate(outcome.deadline),
                })}
              </p>
              <p className="text-body-sm text-text-secondary">
                {t('source', { source: outcome.dataSource })}
              </p>
            </>
          ) : null}
          {view.proposalGuarantee ? (
            <p className="text-body-sm text-text-secondary">
              {t('proposalGuarantee', { text: view.proposalGuarantee })}
            </p>
          ) : null}
        </div>
        {outcome && view.canWrite ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEditing((open) => !open)}
          >
            {editing ? t('cancel') : t('edit')}
          </Button>
        ) : null}
      </header>

      {!outcome ? <p className="text-body-sm text-text-secondary">{t('empty')}</p> : null}
      {view.canWrite && (!outcome || editing) ? (
        <OutcomeForm
          clientId={clientId}
          view={view}
          save={refreshing(actions.save, refresh)}
          onDone={() => setEditing(false)}
        />
      ) : null}

      {outcome ? (
        <>
          <section className="flex flex-col gap-3" aria-label={t('evolution')}>
            <h3 className="text-body font-medium text-text">{t('evolution')}</h3>
            <OutcomeChart
              metric={outcome.metric}
              unit={outcome.unit}
              baseline={outcome.baseline}
              target={outcome.target}
              measurements={view.measurements}
            />
            {view.canWrite ? (
              <MeasurementForm
                outcomeId={outcome.id}
                record={refreshing(actions.recordMeasurement, refresh)}
              />
            ) : null}
          </section>
          <section className="flex flex-col gap-3" aria-label={t('conditions.title')}>
            <h3 className="text-body font-medium text-text">{t('conditions.title')}</h3>
            <Conditions
              outcomeId={outcome.id}
              conditions={view.conditions}
              editable={view.canWrite && outcome.guarantee.status === 'pending'}
              record={refreshing(actions.recordCondition, refresh)}
              add={refreshing(actions.addCondition, refresh)}
            />
          </section>
          <section className="flex flex-col gap-3" aria-label={t('guarantee.title')}>
            <h3 className="text-body font-medium text-text">{t('guarantee.title')}</h3>
            <GuaranteeCard guarantee={outcome.guarantee} deadline={outcome.deadline} />
          </section>
        </>
      ) : null}
    </div>
  );
}
