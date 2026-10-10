import type { MilestoneTrigger } from './plan';

export type LinkableMilestone = {
  id: string;
  position: number;
  trigger: MilestoneTrigger;
  phaseId: string | null;
  status: string;
};

export type LinkablePhase = { id: string; position: number; requiresApproval: boolean };

const byPosition = <T extends { position: number }>(left: T, right: T) =>
  left.position - right.position;

/**
 * Pairs the pending, unlinked phase-approval milestones with the approval phases not yet taken,
 * both in position order; milestones beyond the available phases stay unlinked.
 */
export function linkMilestonesToPhases(
  milestones: readonly LinkableMilestone[],
  phases: readonly LinkablePhase[],
): { milestoneId: string; phaseId: string }[] {
  const taken = new Set(milestones.flatMap((milestone) => milestone.phaseId ?? []));
  const free = phases
    .filter((phase) => phase.requiresApproval && !taken.has(phase.id))
    .sort(byPosition);
  return milestones
    .filter(
      (milestone) =>
        milestone.trigger === 'phase_approval' &&
        milestone.phaseId === null &&
        milestone.status === 'pending',
    )
    .sort(byPosition)
    .flatMap((milestone, index) => {
      const phase = free[index];
      return phase ? [{ milestoneId: milestone.id, phaseId: phase.id }] : [];
    });
}
