'use client';

import { Check } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { cn } from '@agency-os/ui/lib/utils';

export type ProjectStripPhase = {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'awaiting_approval' | 'done';
};

/** The project's phases as a horizontal stepper, the current one highlighted. */
export function ProjectStrip({
  phases,
  current,
  nextMilestone,
}: {
  phases: ProjectStripPhase[];
  current: string | null;
  nextMilestone: { name: string; dueOn: string | null } | null;
}) {
  const t = useTranslations('portal.dashboard.project');
  const format = useFormatter();

  return (
    <div className="flex flex-col gap-3">
      <ol aria-label={t('phases')} className="flex flex-wrap gap-2">
        {phases.map((phase, index) => {
          const active = phase.id === current;
          const done = phase.status === 'done';
          return (
            <li
              key={phase.id}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-body-sm',
                active
                  ? 'border-text bg-surface font-medium text-text'
                  : 'border-border bg-surface-muted text-text-secondary',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full text-[10px]',
                  done
                    ? 'bg-success-bg text-success'
                    : active
                      ? 'bg-brand text-white'
                      : 'bg-border',
                )}
              >
                {done ? <Check className="size-3" /> : index + 1}
              </span>
              <span className="truncate">{phase.name}</span>
            </li>
          );
        })}
      </ol>
      {nextMilestone ? (
        <p className="text-body-sm text-text-secondary">
          {t('nextStep', { name: nextMilestone.name })}
          {nextMilestone.dueOn
            ? ` · ${t('dueOn', {
                date: format.dateTime(new Date(`${nextMilestone.dueOn}T12:00:00Z`), {
                  dateStyle: 'medium',
                }),
              })}`
            : ''}
        </p>
      ) : null}
    </div>
  );
}
