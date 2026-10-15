import { asc, eq } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { emit } from '@/modules/events';
import { evaluateAtDeadline, reachesTarget, targetReachedBy } from './domain/guarantee';
import { fullMonthsSince, GUARANTEE_MONTHS } from './domain/months';

const { outcomeConditions, outcomeMeasurements, projectOutcomes } = schema;

export type GuaranteeDecision = {
  status: 'not_activated' | 'active' | 'closed';
  reason: 'target_met' | 'conditions_failed' | 'months_used' | null;
};

export type LockedOutcome = typeof projectOutcomes.$inferSelect;

/** Locks the outcome for the rest of the transaction, so one decision is taken at a time. */
export async function lockOutcome(
  tx: DbTransaction,
  outcomeId: string,
): Promise<LockedOutcome | null> {
  const [row] = await tx
    .select()
    .from(projectOutcomes)
    .where(eq(projectOutcomes.id, outcomeId))
    .for('update');
  return row ?? null;
}

/**
 * Takes the guarantee decision that is due today (spec 3C §2.5, §2.6), with the outcome locked:
 * at a passed deadline it evaluates the target and the client conditions; while active it counts
 * the months and closes at 3 or when a value reaches the target. Months move without an event;
 * each new state is audited and emits `outcomes.guarantee.decided` once. Returns the new state, or
 * null when the state did not change.
 */
export async function decideGuarantee(
  tx: DbTransaction,
  outcomeId: string,
  today: string,
): Promise<GuaranteeDecision | null> {
  const outcome = await lockOutcome(tx, outcomeId);
  if (!outcome) return null;
  const range = { baseline: Number(outcome.baseline), target: Number(outcome.target) };
  const values = (
    await tx
      .select({ measuredOn: outcomeMeasurements.measuredOn, value: outcomeMeasurements.value })
      .from(outcomeMeasurements)
      .where(eq(outcomeMeasurements.outcomeId, outcome.id))
      .orderBy(asc(outcomeMeasurements.measuredOn))
  ).map((row) => ({ measuredOn: row.measuredOn, value: Number(row.value) }));

  let decision: GuaranteeDecision | null = null;
  let monthsUsed = outcome.monthsUsed;
  let activatedOn = outcome.activatedOn;

  if (outcome.guaranteeStatus === 'pending' && outcome.deadline < today) {
    const conditions = await tx
      .select({ status: outcomeConditions.status })
      .from(outcomeConditions)
      .where(eq(outcomeConditions.outcomeId, outcome.id));
    const evaluation = evaluateAtDeadline({
      targetReached: targetReachedBy(range, values, outcome.deadline),
      conditions: conditions.map((row) => row.status),
    });
    if (evaluation.status === 'active') {
      decision = { status: 'active', reason: null };
      activatedOn = today;
      monthsUsed = 0;
    } else if (evaluation.status === 'not_activated') {
      decision = { status: 'not_activated', reason: evaluation.reason };
    }
  } else if (outcome.guaranteeStatus === 'active' && outcome.activatedOn) {
    const since = outcome.activatedOn;
    monthsUsed = fullMonthsSince(since, today);
    if (values.some((value) => value.measuredOn >= since && reachesTarget(range, value.value))) {
      decision = { status: 'closed', reason: 'target_met' };
    } else if (monthsUsed >= GUARANTEE_MONTHS) {
      decision = { status: 'closed', reason: 'months_used' };
      monthsUsed = GUARANTEE_MONTHS;
    }
  }

  if (!decision) {
    if (monthsUsed !== outcome.monthsUsed) {
      await tx
        .update(projectOutcomes)
        .set({ monthsUsed, updatedAt: new Date() })
        .where(eq(projectOutcomes.id, outcome.id));
    }
    return null;
  }

  await tx
    .update(projectOutcomes)
    .set({
      guaranteeStatus: decision.status,
      guaranteeReason: decision.reason,
      activatedOn,
      monthsUsed,
      updatedAt: new Date(),
    })
    .where(eq(projectOutcomes.id, outcome.id));
  await recordAudit(tx, {
    organizationId: outcome.organizationId,
    action: 'outcome.guarantee_decided',
    resourceType: 'project_outcome',
    resourceId: outcome.id,
    clientId: outcome.clientId,
    metadata: { status: decision.status, reason: decision.reason, monthsUsed },
  });
  await emit(tx, {
    type: 'outcomes.guarantee.decided',
    organizationId: outcome.organizationId,
    clientId: outcome.clientId,
    payload: { outcomeId: outcome.id, status: decision.status, reason: decision.reason },
  });
  return decision;
}
