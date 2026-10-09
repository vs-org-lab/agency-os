'use client';

import { useTranslations } from 'next-intl';
import { planWeeks, type ClientPhaseView } from '@/modules/rooms';

/** The Plan view (RF-061): each phase on a weekly timeline counted from the project start. */
export function PlanView({
  phases,
  startsOn,
}: {
  phases: ReadonlyArray<Pick<ClientPhaseView, 'id' | 'name' | 'status' | 'startedAt' | 'dueOn'>>;
  startsOn: string;
}) {
  const t = useTranslations('rooms');
  const weeks = planWeeks(
    phases.map((phase) => ({
      id: phase.id,
      startedOn: phase.startedAt ? phase.startedAt.slice(0, 10) : null,
      dueOn: phase.dueOn,
    })),
    startsOn,
  );
  const total = Math.max(1, ...weeks.map((week) => week.endWeek + 1));

  return (
    <ol aria-label={t('plan.title')} className="flex flex-col gap-3">
      {phases.map((phase) => {
        const week = weeks.find((entry) => entry.phaseId === phase.id);
        if (!week) return null;
        const label =
          week.startWeek === week.endWeek
            ? t('plan.week', { start: week.startWeek + 1 })
            : t('plan.weeks', { start: week.startWeek + 1, end: week.endWeek + 1 });
        return (
          <li key={phase.id} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-body-sm text-text">{phase.name}</span>
              <span className="text-caption text-text-tertiary">{label}</span>
            </div>
            <div className="relative h-2 rounded-full bg-surface-muted" aria-hidden>
              <div
                className={
                  phase.status === 'done'
                    ? 'absolute inset-y-0 rounded-full bg-text-secondary'
                    : 'absolute inset-y-0 rounded-full bg-text'
                }
                style={{
                  left: `${(week.startWeek / total) * 100}%`,
                  width: `${((week.endWeek - week.startWeek + 1) / total) * 100}%`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
