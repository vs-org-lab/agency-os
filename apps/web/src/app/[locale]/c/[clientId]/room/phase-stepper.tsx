'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { LayoutGroup, m, transitions } from '@agency-os/ui/motion';
import { cn } from '@agency-os/ui/lib/utils';
import type { PhaseView } from '@/modules/rooms';

const RING = 2 * Math.PI * 12;

/** The phase marker: a check when done, a ring filled by the finished steps while running. */
function PhaseMark({ phase }: { phase: PhaseView }) {
  if (phase.status === 'done') {
    return (
      <span className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-full bg-border-strong text-text">
        <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
      </span>
    );
  }
  const total = phase.steps.length;
  const done = phase.steps.filter((step) => step.status === 'done').length;
  const share = phase.status === 'pending' || total === 0 ? 0 : done / total;
  return (
    <svg aria-hidden width="30" height="30" viewBox="0 0 30 30" className="shrink-0">
      <circle cx="15" cy="15" r="12" fill="none" className="stroke-border-strong" strokeWidth="2" />
      {share > 0 ? (
        <m.circle
          cx="15"
          cy="15"
          r="12"
          fill="none"
          className="stroke-text"
          strokeWidth="2"
          strokeLinecap="round"
          transform="rotate(-90 15 15)"
          strokeDasharray={RING}
          initial={{ strokeDashoffset: RING }}
          animate={{ strokeDashoffset: RING * (1 - share) }}
          transition={transitions.slow}
        />
      ) : null}
      <text
        x="15"
        y="19"
        textAnchor="middle"
        className={cn(
          'text-[11px] font-semibold',
          phase.status === 'pending' ? 'fill-text-tertiary' : 'fill-text',
        )}
      >
        {phase.position}
      </text>
    </svg>
  );
}

/** The phases as tabs across the room: marker, position, name and where the phase stands. */
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

  const detail = (phase: PhaseView) => {
    const done = phase.steps.filter((step) => step.status === 'done').length;
    if (phase.status === 'in_progress' || phase.status === 'awaiting_approval') {
      return t('phaseProgress', { done, total: phase.steps.length });
    }
    if (phase.dueOn) {
      return `${t(`phaseStatus.${phase.status}`)} · ${format.dateTime(
        new Date(`${phase.dueOn}T12:00:00Z`),
        { day: 'numeric', month: 'short' },
      )}`;
    }
    return t(`phaseStatus.${phase.status}`);
  };

  return (
    <nav aria-label={t('phases')} className="rd-rise">
      <LayoutGroup id="phase-stepper">
        <ol className="flex overflow-x-auto rounded-lg border border-border bg-surface">
          {phases.map((phase) => {
            const selected = phase.id === selectedId;
            return (
              <li
                key={phase.id}
                className="relative isolate min-w-48 flex-1 border-l border-border first:border-l-0"
              >
                {selected ? (
                  <m.span
                    aria-hidden="true"
                    layoutId="phase-stepper-active"
                    transition={transitions.morph}
                    className="absolute inset-0 -z-10 bg-surface-muted shadow-[inset_0_-2px_0_var(--text)]"
                  />
                ) : null}
                <button
                  type="button"
                  aria-current={selected ? 'step' : undefined}
                  onClick={() => onSelect(phase)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-(--duration-fast) hover:bg-surface-muted/60"
                >
                  <PhaseMark phase={phase} />
                  <span className="flex min-w-0 flex-col">
                    <span aria-hidden className="text-[11px] font-medium text-text-tertiary">
                      {t('phaseNumber', { position: phase.position })}
                    </span>
                    <span
                      className={cn(
                        'truncate text-body-sm font-medium',
                        phase.status === 'pending' ? 'text-text-secondary' : 'text-text',
                      )}
                    >
                      <span aria-hidden>{phase.name}</span>
                      <span className="sr-only">
                        {t('phaseLabel', { position: phase.position, name: phase.name })}
                      </span>
                    </span>
                    <span className="truncate text-caption text-text-tertiary">
                      {detail(phase)}
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
