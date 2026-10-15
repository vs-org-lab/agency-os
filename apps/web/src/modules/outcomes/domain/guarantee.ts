export type ConditionStatus = 'pending' | 'met' | 'failed';

export type DeadlineEvaluation =
  | { status: 'not_activated'; reason: 'target_met' | 'conditions_failed' }
  | { status: 'active' }
  | { status: 'pending' };

type Range = { baseline: number; target: number };

/** The way the metric has to move: a target above the baseline goes up, below goes down. */
export function direction(baseline: number, target: number): 'up' | 'down' {
  return target > baseline ? 'up' : 'down';
}

/** Whether a value reaches the target in the outcome's direction, the target itself included. */
export function reachesTarget(outcome: Range, value: number): boolean {
  return direction(outcome.baseline, outcome.target) === 'up'
    ? value >= outcome.target
    : value <= outcome.target;
}

/** RN-71: only values recorded up to the deadline count for the target at the deadline. */
export function targetReachedBy(
  outcome: Range,
  measurements: readonly { measuredOn: string; value: number }[],
  deadline: string,
): boolean {
  return measurements.some(
    (measurement) =>
      measurement.measuredOn <= deadline && reachesTarget(outcome, measurement.value),
  );
}

/**
 * AUT-26 at the deadline (spec 3C §2.5): a reached target or a failed condition leaves the
 * guarantee not activated; undecided conditions keep it pending; otherwise it is activated.
 */
export function evaluateAtDeadline(input: {
  targetReached: boolean;
  conditions: readonly ConditionStatus[];
}): DeadlineEvaluation {
  if (input.targetReached) return { status: 'not_activated', reason: 'target_met' };
  if (input.conditions.includes('failed')) {
    return { status: 'not_activated', reason: 'conditions_failed' };
  }
  if (input.conditions.includes('pending')) return { status: 'pending' };
  return { status: 'active' };
}
