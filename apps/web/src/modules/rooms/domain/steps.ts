export type StepStatus = 'todo' | 'in_progress' | 'done';

export type StepState = {
  id: string;
  phaseId: string;
  position: number;
  status: StepStatus;
  chained: boolean;
};

/** The step that starts on its own when `doneStepId` is done: the next one in the phase, if chained. */
export function nextChainedStep(
  steps: readonly StepState[],
  doneStepId: string,
): { id: string } | null {
  const done = steps.find((step) => step.id === doneStepId);
  if (!done) return null;
  const next = steps.find(
    (step) => step.phaseId === done.phaseId && step.position === done.position + 1,
  );
  return next?.chained ? { id: next.id } : null;
}
