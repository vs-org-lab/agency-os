'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { cn } from '@agency-os/ui/lib/utils';
import { FormMessage } from '@/components/forms/form-message';
import type { Person, PhaseView, ProjectView, StepStatus } from '@/modules/rooms';
import { roomError, type ActionResult, type RoomError } from './room-errors';

export type ProcessActions = {
  startPhase(phaseId: string): Promise<ActionResult>;
  completePhase(phaseId: string): Promise<ActionResult>;
  requestApproval(phaseId: string): Promise<ActionResult>;
  withdrawApproval(approvalId: string): Promise<ActionResult>;
  updatePhase(phaseId: string, dueOn: string | null): Promise<ActionResult>;
  setStepStatus(stepId: string, status: StepStatus): Promise<ActionResult>;
  updateStep(input: {
    stepId: string;
    assigneeId?: string | null;
    dueOn?: string | null;
    visibleToClient?: boolean;
  }): Promise<ActionResult>;
};

type DoneKey = 'startPhase' | 'completePhase' | 'requestApproval' | 'withdrawApproval' | 'saved';

type Feedback = { tone: 'success'; key: DoneKey } | { tone: 'danger'; error: RoomError };

const FIELD = 'h-9 rounded-md border border-border bg-surface px-2 text-body-sm text-text';

/** The one change each step status offers: start it, finish it, or reopen it. */
const NEXT_STATUS: Record<StepStatus, StepStatus> = {
  todo: 'in_progress',
  in_progress: 'done',
  done: 'in_progress',
};

function defaultPhase(phases: readonly PhaseView[]): string | null {
  const active = phases.find(
    (phase) => phase.status === 'in_progress' || phase.status === 'awaiting_approval',
  );
  return (active ?? phases.find((phase) => phase.status === 'pending') ?? phases[0])?.id ?? null;
}

/**
 * C-01: phases on the left and the selected phase's steps on the right. Writers start, complete
 * and send phases for approval; whoever a step is assigned to moves it along.
 */
export function ProcessBoard({
  project,
  people,
  writable,
  currentUserId,
  actions,
}: {
  project: ProjectView;
  people: readonly Person[];
  writable: boolean;
  currentUserId: string;
  actions: ProcessActions;
}) {
  const t = useTranslations('rooms');
  const format = useFormatter();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(defaultPhase(project.phases));
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, startTransition] = useTransition();
  const selected = project.phases.find((phase) => phase.id === selectedId) ?? null;
  const approval = selected
    ? project.approvals.find((entry) => entry.phaseId === selected.id && entry.status === 'pending')
    : undefined;
  const decided = selected
    ? project.approvals.find((entry) => entry.phaseId === selected.id && entry.status !== 'pending')
    : undefined;
  const [dueOn, setDueOn] = useState(selected?.dueOn ?? '');

  const run = (key: DoneKey, action: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await action().catch(() => ({ ok: false, code: 'not_found' }) as const);
      setFeedback(
        result.ok ? { tone: 'success', key } : { tone: 'danger', error: roomError(result.code) },
      );
      if (result.ok) router.refresh();
    });

  return (
    <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
      <nav aria-label={t('phases')}>
        <ol className="flex flex-col gap-1">
          {project.phases.map((phase) => (
            <li key={phase.id}>
              <button
                type="button"
                aria-current={phase.id === selectedId ? 'step' : undefined}
                onClick={() => {
                  setSelectedId(phase.id);
                  setDueOn(phase.dueOn ?? '');
                  setFeedback(null);
                }}
                className={cn(
                  'flex w-full flex-col items-start gap-1 rounded-md px-3 py-2 text-left hover:bg-surface-muted',
                  phase.id === selectedId && 'bg-surface-muted',
                )}
              >
                <span className="text-body-sm font-medium text-text">
                  {t('phaseLabel', { position: phase.position, name: phase.name })}
                </span>
                <span className="text-caption text-text-secondary">
                  {t(`phaseStatus.${phase.status}`)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {selected ? (
        <section aria-labelledby="phase-title" className="flex flex-col gap-4">
          <header className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="phase-title" className="text-title-sm text-text">
                {selected.name}
              </h2>
              <Badge variant={selected.status === 'done' ? 'secondary' : 'outline'}>
                {t(`phaseStatus.${selected.status}`)}
              </Badge>
              {selected.requiresApproval ? (
                <Badge variant="outline">{t('requiresApproval')}</Badge>
              ) : null}
            </div>
            {approval ? (
              <p className="text-body-sm text-text-secondary">
                {t('approval.pending', {
                  date: format.dateTime(new Date(approval.requestedAt), { dateStyle: 'medium' }),
                })}
              </p>
            ) : null}
            {!approval && decided?.decidedAt ? (
              <div className="flex flex-col gap-1 rounded-md bg-surface-muted p-3">
                <p className="text-body-sm text-text-secondary">
                  {t(
                    `approval.${decided.status === 'approved' ? 'approved' : 'changes_requested'}`,
                    {
                      date: format.dateTime(new Date(decided.decidedAt), { dateStyle: 'medium' }),
                    },
                  )}
                </p>
                {decided.comment ? (
                  <p className="whitespace-pre-line text-body-sm text-text">{decided.comment}</p>
                ) : null}
              </div>
            ) : null}
            <div aria-live="polite">
              {feedback?.tone === 'success' ? (
                <FormMessage tone="success">{t(`done.${feedback.key}`)}</FormMessage>
              ) : null}
              {feedback?.tone === 'danger' ? (
                <FormMessage tone="danger">{t(`errors.${feedback.error}`)}</FormMessage>
              ) : null}
            </div>
            {writable ? (
              <div className="flex flex-wrap items-end gap-2">
                {selected.status === 'pending' ? (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => run('startPhase', () => actions.startPhase(selected.id))}
                  >
                    {t('actions.startPhase')}
                  </Button>
                ) : null}
                {selected.status === 'in_progress' && selected.requiresApproval ? (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run('requestApproval', () => actions.requestApproval(selected.id))
                    }
                  >
                    {t('actions.requestApproval')}
                  </Button>
                ) : null}
                {selected.status === 'in_progress' && !selected.requiresApproval ? (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => run('completePhase', () => actions.completePhase(selected.id))}
                  >
                    {t('actions.completePhase')}
                  </Button>
                ) : null}
                {approval ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      run('withdrawApproval', () => actions.withdrawApproval(approval.id))
                    }
                  >
                    {t('actions.withdrawApproval')}
                  </Button>
                ) : null}
                <form
                  className="flex items-end gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    run('saved', () => actions.updatePhase(selected.id, dueOn || null));
                  }}
                >
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="phase-due">{t('phaseDue')}</Label>
                    <Input
                      id="phase-due"
                      type="date"
                      className="h-9"
                      value={dueOn}
                      onChange={(event) => setDueOn(event.target.value)}
                    />
                  </div>
                  <Button type="submit" size="sm" variant="outline" disabled={pending}>
                    {t('actions.saveDue')}
                  </Button>
                </form>
              </div>
            ) : null}
          </header>

          <ol aria-label={t('stepsOf', { name: selected.name })} className="flex flex-col gap-2">
            {selected.steps.map((step) => {
              const canChangeStatus =
                (writable || step.assigneeId === currentUserId) &&
                selected.status === 'in_progress';
              return (
                <li
                  key={step.id}
                  className="flex flex-col gap-2 rounded-md border border-border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-body-sm font-medium text-text">{step.name}</span>
                    {step.visibleToClient ? (
                      <Badge variant="secondary">{t('step.visible')}</Badge>
                    ) : null}
                    {step.shared ? <Badge variant="outline">{t('step.shared')}</Badge> : null}
                    {step.reopened ? <Badge variant="outline">{t('step.reopened')}</Badge> : null}
                    {step.chained ? (
                      <span className="text-caption text-text-tertiary">{t('step.chained')}</span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant={step.status === 'done' ? 'secondary' : 'outline'}>
                      {t(`stepStatus.${step.status}`)}
                    </Badge>
                    {canChangeStatus ? (
                      <Button
                        size="sm"
                        variant={step.status === 'in_progress' ? 'default' : 'outline'}
                        disabled={pending}
                        aria-label={t(`step.next.${step.status}`, { name: step.name })}
                        onClick={() =>
                          run('saved', () =>
                            actions.setStepStatus(step.id, NEXT_STATUS[step.status]),
                          )
                        }
                      >
                        {t(`step.nextShort.${step.status}`)}
                      </Button>
                    ) : null}
                    {writable ? (
                      <>
                        <select
                          aria-label={t('step.assignee', { name: step.name })}
                          className={FIELD}
                          value={step.assigneeId ?? ''}
                          disabled={pending}
                          onChange={(event) =>
                            run('saved', () =>
                              actions.updateStep({
                                stepId: step.id,
                                assigneeId: event.target.value || null,
                              }),
                            )
                          }
                        >
                          <option value="">{t('step.unassigned')}</option>
                          {people.map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.name}
                            </option>
                          ))}
                        </select>
                        <Input
                          aria-label={t('step.due', { name: step.name })}
                          type="date"
                          className="h-9 w-40"
                          defaultValue={step.dueOn ?? ''}
                          onBlur={(event) => {
                            const value = event.target.value || null;
                            if (value !== step.dueOn) {
                              run('saved', () =>
                                actions.updateStep({ stepId: step.id, dueOn: value }),
                              );
                            }
                          }}
                        />
                        <label className="flex items-center gap-2 text-body-sm text-text">
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={step.visibleToClient}
                            disabled={pending}
                            onChange={(event) =>
                              run('saved', () =>
                                actions.updateStep({
                                  stepId: step.id,
                                  visibleToClient: event.target.checked,
                                }),
                              )
                            }
                          />
                          {t('step.visible')}
                        </label>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
