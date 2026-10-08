'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import { ORBIT_FRONT_MAX_POINTS, type OrbitCriterion, type OrbitGrid } from '@/modules/diagnosis';

export type PublishResult = { ok: true; version: number } | { ok: false; rule: string };

function newCriterionId(): string {
  return `criterion_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

function frontTotal(criteria: OrbitCriterion[]): number {
  return criteria.reduce((total, criterion) => total + (Number(criterion.maxPoints) || 0), 0);
}

export function OrbitGridEditor({
  grid,
  version,
  publish,
}: {
  grid: OrbitGrid;
  version: number;
  publish: (definition: OrbitGrid) => Promise<PublishResult>;
}) {
  const t = useTranslations();
  const [draft, setDraft] = useState<OrbitGrid>(grid);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const balanced = draft.fronts.every(
    (front) => frontTotal(front.criteria) === ORBIT_FRONT_MAX_POINTS,
  );

  const updateCriterion = (
    frontIndex: number,
    criterionIndex: number,
    change: (criterion: OrbitCriterion) => OrbitCriterion,
  ) =>
    setDraft((current) => ({
      fronts: current.fronts.map((front, index) =>
        index === frontIndex
          ? {
              ...front,
              criteria: front.criteria.map((criterion, position) =>
                position === criterionIndex ? change(criterion) : criterion,
              ),
            }
          : front,
      ),
    }));

  const updateCriteria = (
    frontIndex: number,
    change: (criteria: OrbitCriterion[]) => OrbitCriterion[],
  ) =>
    setDraft((current) => ({
      fronts: current.fronts.map((front, index) =>
        index === frontIndex ? { ...front, criteria: change(front.criteria) } : front,
      ),
    }));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-sm text-text-secondary">
        {t('settings.coreTemplates.version', { version })}
      </p>
      {draft.fronts.map((front, frontIndex) => {
        const total = frontTotal(front.criteria);
        return (
          <fieldset key={front.front} className="flex flex-col gap-3 border-t border-border pt-4">
            <legend className="flex w-full items-baseline justify-between gap-2">
              <span className="text-label text-text">{t(`diagnosis.fronts.${front.front}`)}</span>
              <span
                className={
                  total === ORBIT_FRONT_MAX_POINTS
                    ? 'text-body-sm text-text-secondary tabular-nums'
                    : 'text-body-sm text-warning tabular-nums'
                }
              >
                {t('settings.coreTemplates.grid.total', { total })}
              </span>
            </legend>
            {front.criteria.map((criterion, criterionIndex) => {
              const id = `${front.front}-${criterion.id}`;
              return (
                <div
                  key={criterion.id}
                  className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-2"
                >
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`${id}-name-pt`}>
                      {t('settings.coreTemplates.grid.criterion')}
                    </Label>
                    <Input
                      id={`${id}-name-pt`}
                      value={criterion.name['pt-PT']}
                      onChange={(event) =>
                        updateCriterion(frontIndex, criterionIndex, (current) => ({
                          ...current,
                          name: { ...current.name, 'pt-PT': event.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`${id}-name-en`}>{t('settings.coreTemplates.english')}</Label>
                    <Input
                      id={`${id}-name-en`}
                      value={criterion.name.en}
                      onChange={(event) =>
                        updateCriterion(frontIndex, criterionIndex, (current) => ({
                          ...current,
                          name: { ...current.name, en: event.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`${id}-observes-pt`}>
                      {t('settings.coreTemplates.grid.observes')}
                    </Label>
                    <Input
                      id={`${id}-observes-pt`}
                      value={criterion.observes['pt-PT']}
                      onChange={(event) =>
                        updateCriterion(frontIndex, criterionIndex, (current) => ({
                          ...current,
                          observes: { ...current.observes, 'pt-PT': event.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`${id}-observes-en`}>
                      {t('settings.coreTemplates.english')}
                    </Label>
                    <Input
                      id={`${id}-observes-en`}
                      value={criterion.observes.en}
                      onChange={(event) =>
                        updateCriterion(frontIndex, criterionIndex, (current) => ({
                          ...current,
                          observes: { ...current.observes, en: event.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="flex items-end gap-2 md:col-span-2">
                    <div className="flex w-36 flex-col gap-1">
                      <Label htmlFor={`${id}-max`}>
                        {t('settings.coreTemplates.grid.maxPoints')}
                      </Label>
                      <Input
                        id={`${id}-max`}
                        type="number"
                        min={1}
                        max={ORBIT_FRONT_MAX_POINTS}
                        value={criterion.maxPoints}
                        onChange={(event) =>
                          updateCriterion(frontIndex, criterionIndex, (current) => ({
                            ...current,
                            maxPoints: Number(event.target.value),
                          }))
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={front.criteria.length === 1}
                      onClick={() =>
                        updateCriteria(frontIndex, (criteria) =>
                          criteria.filter((_, position) => position !== criterionIndex),
                        )
                      }
                    >
                      {t('settings.coreTemplates.grid.removeCriterion')}
                    </Button>
                  </div>
                </div>
              );
            })}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  updateCriteria(frontIndex, (criteria) => [
                    ...criteria,
                    {
                      id: newCriterionId(),
                      name: { 'pt-PT': '', en: '' },
                      observes: { 'pt-PT': '', en: '' },
                      maxPoints: 1,
                    },
                  ])
                }
              >
                {t('settings.coreTemplates.grid.addCriterion')}
              </Button>
            </div>
          </fieldset>
        );
      })}
      {!balanced ? (
        <FormMessage tone="warning">{t('settings.coreTemplates.grid.mustSum')}</FormMessage>
      ) : null}
      {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
      <div>
        <Button
          type="button"
          disabled={!balanced || pending}
          onClick={() =>
            startTransition(async () => {
              const result = await publish(draft);
              setMessage(
                result.ok
                  ? {
                      tone: 'success',
                      text: t('settings.coreTemplates.published', { version: result.version }),
                    }
                  : {
                      tone: 'danger',
                      text: t(`settings.coreTemplates.errors.${result.rule}` as never),
                    },
              );
            })
          }
        >
          {t('settings.coreTemplates.publish')}
        </Button>
      </div>
    </div>
  );
}
