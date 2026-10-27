'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { cn } from '@agency-os/ui/lib/utils';
import type { ClientApprovalView, ClientPhaseView, ClientProjectView } from '@/modules/rooms';
import { ApprovalDecision, type DecideApproval } from './approval-decision';
import { UpdateFeed } from './update-feed';

const VISIBLE_UPDATES = 4;

/** The phase the client should look at first: the one in motion, else the first not done. */
function initialPhase(phases: ClientPhaseView[]): string | null {
  const active = phases.find(
    (phase) => phase.status === 'in_progress' || phase.status === 'awaiting_approval',
  );
  return (active ?? phases.find((phase) => phase.status !== 'done') ?? phases.at(-1))?.id ?? null;
}

function StepMark({ status }: { status: ClientPhaseView['steps'][number]['status'] }) {
  if (status === 'done') {
    return (
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center rounded-full bg-success-bg text-success"
      >
        <Check className="size-3" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
        status === 'in_progress' ? 'border-brand' : 'border-border-strong',
      )}
    >
      {status === 'in_progress' ? <span className="size-2 rounded-full bg-brand" /> : null}
    </span>
  );
}

/**
 * The room as the client sees it: what waits on them first, then the phases as a stepper with
 * the selected phase's steps, then the latest updates. The portal and "Ver como cliente" render
 * the same component over the same data.
 */
export function ClientRoom({
  project,
  decide,
}: {
  project: ClientProjectView;
  /** The decision action; only the client's decision maker gets one. */
  decide?: DecideApproval;
}) {
  const t = useTranslations('rooms');
  const format = useFormatter();
  const day = (value: string) => format.dateTime(new Date(value), { dateStyle: 'medium' });
  const [selectedId, setSelectedId] = useState(() => initialPhase(project.phases));
  const [showAllUpdates, setShowAllUpdates] = useState(false);

  const selected = project.phases.find((phase) => phase.id === selectedId) ?? null;
  const doneCount = project.phases.filter((phase) => phase.status === 'done').length;
  const pending = project.approvals.filter((approval) => approval.status === 'pending');
  const decided = project.approvals.filter(
    (approval): approval is ClientApprovalView & { status: 'approved' | 'changes_requested' } =>
      approval.status === 'approved' || approval.status === 'changes_requested',
  );
  const updates = showAllUpdates ? project.updates : project.updates.slice(0, VISIBLE_UPDATES);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h2 className="text-title text-text">{project.name}</h2>
        {project.phases.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div
              role="progressbar"
              aria-label={t('room.progress', { done: doneCount, total: project.phases.length })}
              aria-valuemin={0}
              aria-valuemax={project.phases.length}
              aria-valuenow={doneCount}
              className="flex gap-1"
            >
              {project.phases.map((phase) => (
                <span
                  key={phase.id}
                  className={cn(
                    'h-1 flex-1 rounded-full',
                    phase.status === 'done'
                      ? 'bg-success'
                      : phase.status === 'pending'
                        ? 'bg-border'
                        : 'bg-brand',
                  )}
                />
              ))}
            </div>
            <p className="text-caption text-text-secondary">
              {t('room.progress', { done: doneCount, total: project.phases.length })}
            </p>
          </div>
        ) : null}
      </header>

      {pending.length > 0 ? (
        <section
          aria-labelledby="client-room-decision"
          className="flex flex-col gap-3 rounded-lg border border-warning bg-warning-bg/40 p-4"
        >
          <h3 id="client-room-decision" className="text-body-sm font-semibold text-text">
            {t('room.needsDecision')}
          </h3>
          <ul className="flex flex-col gap-4">
            {pending.map((approval) => (
              <li key={approval.id} className="flex flex-col gap-2">
                <span className="text-body font-medium text-text">{approval.phaseName}</span>
                <span className="text-body-sm text-text-secondary">
                  {t('clientApproval.pending', { date: day(approval.requestedAt) })}
                </span>
                {decide ? <ApprovalDecision approvalId={approval.id} decide={decide} /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {project.phases.length > 0 ? (
        <section aria-labelledby="client-room-process" className="flex flex-col gap-4">
          <h3 id="client-room-process" className="sr-only">
            {t('room.phases')}
          </h3>
          <ol className="grid auto-cols-fr grid-flow-col overflow-x-auto rounded-lg border border-border bg-surface">
            {project.phases.map((phase) => {
              const active = phase.id === selectedId;
              return (
                <li key={phase.id} className="min-w-36 border-r border-border last:border-r-0">
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedId(phase.id)}
                    className={cn(
                      'flex w-full items-center gap-2.5 border-b-2 px-4 py-3 text-left text-body-sm transition-colors duration-(--duration-fast)',
                      active
                        ? 'border-text font-medium text-text'
                        : 'border-transparent text-text-secondary hover:bg-surface-muted',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-full text-[10px]',
                        phase.status === 'done'
                          ? 'bg-success-bg text-success'
                          : phase.status === 'pending'
                            ? 'border border-border-strong'
                            : 'bg-brand text-white',
                      )}
                    >
                      {phase.status === 'done' ? <Check className="size-3" /> : phase.position}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{phase.name}</span>
                      <span className="truncate text-caption font-normal text-text-tertiary">
                        {t(`phaseStatus.${phase.status}`)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {selected ? (
            <div
              aria-label={t('room.stepsOfPhase', { name: selected.name })}
              role="group"
              className="flex flex-col rounded-lg border border-border bg-surface"
            >
              {selected.steps.length === 0 ? (
                <p className="p-4 text-body-sm text-text-secondary">{t('room.noSteps')}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {selected.steps.map((step) => (
                    <li key={step.id} className="flex items-center gap-3 px-4 py-3">
                      <StepMark status={step.status} />
                      <span
                        className={cn(
                          'min-w-0 flex-1 text-body-sm',
                          step.status === 'done' ? 'text-text-secondary' : 'text-text',
                        )}
                      >
                        {step.name}
                      </span>
                      {step.dueOn && step.status !== 'done' ? (
                        <span className="text-caption text-text-tertiary">
                          {t('room.due', { date: day(`${step.dueOn}T12:00:00Z`) })}
                        </span>
                      ) : null}
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-caption text-text-secondary">
                        {t(`stepStatus.${step.status}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="client-room-updates" className="flex flex-col gap-3">
        <h3 id="client-room-updates" className="text-title-sm text-text">
          {t('updates.title')}
        </h3>
        <UpdateFeed updates={updates} />
        {project.updates.length > VISIBLE_UPDATES ? (
          <button
            type="button"
            onClick={() => setShowAllUpdates((value) => !value)}
            className="self-start text-body-sm text-link hover:underline"
          >
            {showAllUpdates
              ? t('room.showLess')
              : t('room.showAll', { count: project.updates.length })}
          </button>
        ) : null}
      </section>

      {decided.length > 0 ? (
        <section aria-labelledby="client-room-decisions" className="flex flex-col gap-3">
          <h3 id="client-room-decisions" className="text-title-sm text-text">
            {t('room.decisions')}
          </h3>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {decided.map((approval) => (
              <li key={approval.id} className="flex flex-col gap-1 px-4 py-3">
                <span className="text-body-sm font-medium text-text">{approval.phaseName}</span>
                <span className="text-caption text-text-secondary">
                  {t(`clientApproval.${approval.status}`, {
                    date: day(approval.decidedAt ?? approval.requestedAt),
                  })}
                </span>
                {approval.comment ? (
                  <p className="whitespace-pre-line text-body-sm text-text">{approval.comment}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
