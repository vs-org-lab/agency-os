export type PhaseStatus = 'pending' | 'in_progress' | 'awaiting_approval' | 'done';

export type PhaseState = {
  id: string;
  position: number;
  status: PhaseStatus;
  requiresApproval: boolean;
};

export type ApprovalState = 'pending' | 'approved' | null;

/** A phase starts only when it is pending and every earlier phase is done (RN-40, US-15). */
export function canStartPhase(
  phases: readonly PhaseState[],
  phaseId: string,
): { ok: true } | { ok: false; rule: 'previous_phase_open' | 'invalid_state' } {
  const target = phases.find((phase) => phase.id === phaseId);
  if (!target || target.status !== 'pending') return { ok: false, rule: 'invalid_state' };
  const open = phases.some((phase) => phase.position < target.position && phase.status !== 'done');
  return open ? { ok: false, rule: 'previous_phase_open' } : { ok: true };
}

/** A phase completes with every step done and, when it requires one, the client's approval. */
export function canCompletePhase(
  phase: PhaseState,
  steps: ReadonlyArray<{ status: 'todo' | 'in_progress' | 'done' }>,
  approval: ApprovalState,
): { ok: true } | { ok: false; rule: 'steps_open' | 'approval_required' | 'invalid_state' } {
  if (phase.status !== 'in_progress' && phase.status !== 'awaiting_approval') {
    return { ok: false, rule: 'invalid_state' };
  }
  if (steps.some((step) => step.status !== 'done')) return { ok: false, rule: 'steps_open' };
  if (phase.requiresApproval && approval !== 'approved') {
    return { ok: false, rule: 'approval_required' };
  }
  return { ok: true };
}
