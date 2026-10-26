'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import type { OrbitFront } from '@agency-os/db';
import type { Locale } from '@agency-os/i18n';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { ScoreSlider } from '@agency-os/ui/components/score-slider';
import { FormMessage } from '@/components/forms/form-message';
import { SubmitButton } from '@/components/forms/submit-button';
import { ORBIT_FRONT_MAX_POINTS, type OrbitGrid, type OrbitIndexRow } from '@/modules/diagnosis';
import { saveScoresAction } from './actions';

type ScoreView = { front: OrbitFront; criterionId: string; points: number; justification: string };

function FrontScores({
  engagementId,
  dealId,
  front,
  scores,
  row,
  writable,
  locale,
}: {
  engagementId: string;
  dealId: string;
  front: OrbitGrid['fronts'][number];
  scores: ScoreView[];
  row: OrbitIndexRow | undefined;
  writable: boolean;
  locale: Locale;
}) {
  const t = useTranslations('diagnosis');
  const criterionIds = front.criteria.map((criterion) => criterion.id);
  const [state, formAction] = useActionState(
    saveScoresAction.bind(null, engagementId, dealId, front.front, criterionIds),
    { status: 'idle' },
  );
  const score = (criterionId: string) =>
    scores.find((entry) => entry.front === front.front && entry.criterionId === criterionId);

  return (
    <form action={formAction} className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-label text-text">{t(`fronts.${front.front}`)}</h3>
        <span className="text-body-sm text-text-secondary tabular-nums">
          {t('orbit.total', { total: row?.total ?? 0, max: ORBIT_FRONT_MAX_POINTS })}
        </span>
      </div>
      <ul className="flex flex-col gap-3">
        {front.criteria.map((criterion) => {
          const current = score(criterion.id);
          return (
            <li
              key={criterion.id}
              className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.4fr)]"
            >
              <div className="flex flex-col">
                <span className="text-body-sm font-medium text-text">{criterion.name[locale]}</span>
                <span className="text-caption text-text-tertiary">
                  {criterion.observes[locale]}
                </span>
              </div>
              <ScoreSlider
                id={`points-${criterion.id}`}
                name={`points-${criterion.id}`}
                label={t('orbit.points', { max: criterion.maxPoints })}
                max={criterion.maxPoints}
                disabled={!writable}
                defaultValue={current?.points ?? null}
                clearLabel={t('orbit.clear')}
                valueText={(value, max) =>
                  value === null ? t('orbit.noScore') : t('orbit.score', { value, max })
                }
              />
              <div className="flex flex-col gap-1">
                <Label htmlFor={`justification-${criterion.id}`} className="sr-only">
                  {t('orbit.justification')}
                </Label>
                <Input
                  id={`justification-${criterion.id}`}
                  name={`justification-${criterion.id}`}
                  required
                  maxLength={2000}
                  disabled={!writable}
                  defaultValue={current?.justification ?? ''}
                  placeholder={t('orbit.justification')}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {state.status === 'error' ? (
        <FormMessage tone="danger">{t(`orbit.errors.${state.code}` as never)}</FormMessage>
      ) : null}
      {state.status === 'saved' ? (
        <FormMessage tone="success">{t('orbit.saved')}</FormMessage>
      ) : null}
      {writable ? (
        <div className="md:w-56">
          <SubmitButton>{t('orbit.save')}</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}

export function OrbitSection({
  engagementId,
  dealId,
  grid,
  scores,
  index,
  writable,
  locale,
}: {
  engagementId: string;
  dealId: string;
  grid: OrbitGrid;
  scores: ScoreView[];
  index: OrbitIndexRow[];
  writable: boolean;
  locale: Locale;
}) {
  const t = useTranslations('diagnosis.orbit');
  return (
    <section
      aria-labelledby="core-orbit-title"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
    >
      <header className="flex flex-col gap-1">
        <h2 id="core-orbit-title" className="text-title-sm text-text">
          {t('title')}
        </h2>
        <p className="text-body-sm text-text-secondary">{t('description')}</p>
      </header>
      {grid.fronts.map((front) => (
        <FrontScores
          key={front.front}
          engagementId={engagementId}
          dealId={dealId}
          front={front}
          scores={scores}
          row={index.find((row) => row.front === front.front)}
          writable={writable}
          locale={locale}
        />
      ))}
    </section>
  );
}
