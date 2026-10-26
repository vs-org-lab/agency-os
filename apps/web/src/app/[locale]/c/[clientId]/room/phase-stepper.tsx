'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { Check, Circle, CircleDot } from 'lucide-react';
import { LayoutGroup, m, transitions } from '@agency-os/ui/motion';
import { cn } from '@agency-os/ui/lib/utils';
import type { PhaseView } from '@/modules/rooms';

const PHASE_ICON = {
  pending: Circle,
  in_progress: CircleDot,
  awaiting_approval: CircleDot,
  done: Check,
} as const;

/** The phases as a vertical list: a status circle, the name and the due date, one selected. */
export function PhaseStepper({
  phases,
  selectedId,
  onSelect,
}: {
  phases: readonly PhaseView[];
  selectedId: string | null;
  onSelect: (phase: PhaseView) => void;
}) {
  const t = useTranslations('rooms');
  const format = useFormatter();

  return (
    <nav aria-label={t('phases')}>
      <LayoutGroup id="phase-stepper">
        <ol className="flex flex-col gap-1">
          {phases.map((phase) => {
            const Icon = PHASE_ICON[phase.status];
            const selected = phase.id === selectedId;
            return (
              <li key={phase.id} className="relative isolate">
                {selected ? (
                  <m.span
                    aria-hidden="true"
                    layoutId="phase-stepper-active"
                    transition={transitions.morph}
                    className="absolute inset-0 -z-10 rounded-md bg-surface-muted"
                  />
                ) : null}
                <button
                  type="button"
                  aria-current={selected ? 'step' : undefined}
                  onClick={() => onSelect(phase)}
                  className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left hover:bg-surface-muted/60"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border',
                      phase.status === 'done'
                        ? 'border-success bg-success-bg text-success'
                        : phase.status === 'pending'
                          ? 'border-border-strong text-text-tertiary'
                          : 'border-info bg-info-bg text-info',
                    )}
                  >
                    <Icon className="size-3" />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-body-sm font-medium text-text">
                      {t('phaseLabel', { position: phase.position, name: phase.name })}
                    </span>
                    <span className="text-caption text-text-secondary">
                      {t(`phaseStatus.${phase.status}`)}
                      {phase.dueOn
                        ? ` · ${format.dateTime(new Date(`${phase.dueOn}T12:00:00Z`), { dateStyle: 'short' })}`
                        : ''}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </LayoutGroup>
    </nav>
  );
}
