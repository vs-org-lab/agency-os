'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import { Label } from '@agency-os/ui/components/label';
import { DateField } from '@/components/forms/date-field';
import { FormMessage } from '@/components/forms/form-message';
import type { Person, PhaseView, ProjectView, StepStatus } from '@/modules/rooms';
import { PhaseStepper } from './phase-stepper';
import { roomError, type ActionResult, type RoomError } from './room-errors';
import { StepPanel } from './step-panel';
import { StepRow } from './step-row';

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
  editable = writable,
  currentUserId,
  actions,
}: {
  project: ProjectView;
  people: readonly Person[];
  /** Phases and approvals: the founder and the client's managers. */
  writable: boolean;
  /** Steps: also the project's freelancer (RN-51, "L E (próprio)"). */
  editable?: boolean;
  currentUserId: string;
  actions: ProcessActions;
}) {
  const t = useTranslations('rooms');
  const format = useFormatter();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(defaultPhase(project.phases));
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [openStepId, setOpenStepId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selected = project.phases.find((phase) => phase.id === selectedId) ?? null;
  const approval = selected
    ? project.approvals.find((entry) => entry.phaseId === selected.id && entry.status === 'pending')
    : undefined;
  const decided = selected
    ? project.approvals.find((entry) => entry.phaseId === selected.id && entry.status !== 'pending')
    : undefined;
  const openStep = selected?.steps.find((step) => step.id === openStepId) ?? null;
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
      <PhaseStepper
        phases={project.phases}
        selectedId={selectedId}
        onSelect={(phase) => {
          setSelectedId(phase.id);
          setDueOn(phase.dueOn ?? '');
          setFeedback(null);
        }}
      />

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
                    <DateField
                      id="phase-due"
                      name="dueOn"
                      label={t('phaseDue')}
                      value={dueOn}
                      onValueChange={setDueOn}
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
            {selected.steps.map((step) => (
              <StepRow
                key={step.id}
                step={step}
                assignee={people.find((person) => person.id === step.assigneeId) ?? null}
                canEdit={
                  (editable || step.assigneeId === currentUserId) &&
                  selected.status === 'in_progress'
                }
                pending={pending}
                onOpen={() => setOpenStepId(step.id)}
                onToggle={async (done) => {
                  run('saved', () => actions.setStepStatus(step.id, done ? 'done' : 'in_progress'));
                }}
              />
            ))}
          </ol>
        </section>
      ) : null}
      <StepPanel
        step={openStep}
        people={people}
        editable={editable}
        pending={pending}
        onClose={() => setOpenStepId(null)}
        onChange={(stepId, changes) =>
          run('saved', () => actions.updateStep({ stepId, ...changes }))
        }
      />
    </div>
  );
}
