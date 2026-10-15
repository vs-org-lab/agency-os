import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { requestFlush } from '@/modules/events';
import type { VerifiedClaims } from '@/platform/db';
import {
  INVALID_INPUT,
  INVALID_STATE,
  lisbonDay,
  NOT_FOUND,
  nowOf,
  OK,
  outcomeWriter,
  type NotFound,
  type OutcomesDeps,
} from './access';
import { decideGuarantee, lockOutcome } from './guarantee';

const { outcomeConditions, projectOutcomes } = schema;

type Result = typeof OK | NotFound | typeof INVALID_INPUT | typeof INVALID_STATE;

async function outcomeClient(outcomeId: string, deps: OutcomesDeps) {
  if (!z.uuid().safeParse(outcomeId).success) return null;
  const [row] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ clientId: projectOutcomes.clientId })
      .from(projectOutcomes)
      .where(eq(projectOutcomes.id, outcomeId)),
  );
  return row?.clientId ?? null;
}

/** A client condition beyond the three of RN-71, while the guarantee is still undecided. */
export async function addCondition(
  claims: VerifiedClaims,
  input: { outcomeId: string; description: string },
  deps: OutcomesDeps,
): Promise<Result> {
  const clientId = await outcomeClient(input.outcomeId, deps);
  if (!clientId) return NOT_FOUND;
  const actor = await outcomeWriter(claims, clientId, deps);
  if (!actor) return NOT_FOUND;
  const description = input.description.trim();
  if (description.length === 0 || description.length > 200) return INVALID_INPUT;

  return deps.contexts.withSystemContext(async (tx) => {
    const outcome = await lockOutcome(tx, input.outcomeId);
    if (!outcome) return NOT_FOUND;
    if (outcome.guaranteeStatus !== 'pending') return INVALID_STATE;
    const [created] = await tx
      .insert(outcomeConditions)
      .values({
        organizationId: outcome.organizationId,
        clientId: outcome.clientId,
        outcomeId: outcome.id,
        kind: 'other',
        description,
      })
      .returning({ id: outcomeConditions.id });
    await recordAudit(tx, {
      organizationId: outcome.organizationId,
      action: 'outcome.condition_added',
      resourceType: 'outcome_condition',
      resourceId: created?.id ?? null,
      clientId: outcome.clientId,
      metadata: {},
    });
    return OK;
  });
}

/**
 * RF-121: the team records whether a client condition was met, with today's date; a failure
 * carries a note. Conditions are final once the guarantee is decided. Deciding the last pending
 * condition after the deadline decides the guarantee at once (spec 3C §2.5).
 */
export async function recordCondition(
  claims: VerifiedClaims,
  input: { conditionId: string; status: 'met' | 'failed' | 'pending'; note?: string },
  deps: OutcomesDeps,
): Promise<Result> {
  if (!z.uuid().safeParse(input.conditionId).success) return NOT_FOUND;
  const [condition] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ outcomeId: outcomeConditions.outcomeId, clientId: outcomeConditions.clientId })
      .from(outcomeConditions)
      .where(eq(outcomeConditions.id, input.conditionId)),
  );
  if (!condition) return NOT_FOUND;
  const actor = await outcomeWriter(claims, condition.clientId, deps);
  if (!actor) return NOT_FOUND;
  const note = input.note?.trim() || null;
  if (!['met', 'failed', 'pending'].includes(input.status)) return INVALID_INPUT;
  if ((note?.length ?? 0) > 500 || (input.status === 'failed' && !note)) return INVALID_INPUT;
  const today = lisbonDay(nowOf(deps));

  const result = await deps.contexts.withSystemContext(async (tx) => {
    const outcome = await lockOutcome(tx, condition.outcomeId);
    if (!outcome) return { result: NOT_FOUND, decided: false };
    if (outcome.guaranteeStatus !== 'pending') return { result: INVALID_STATE, decided: false };
    await tx
      .update(outcomeConditions)
      .set({
        status: input.status,
        recordedOn: input.status === 'pending' ? null : today,
        note,
        recordedBy: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(outcomeConditions.id, input.conditionId));
    await recordAudit(tx, {
      organizationId: outcome.organizationId,
      action: 'outcome.condition_recorded',
      resourceType: 'outcome_condition',
      resourceId: input.conditionId,
      clientId: outcome.clientId,
      metadata: { status: input.status },
    });
    const [pending] = await tx
      .select({ id: outcomeConditions.id })
      .from(outcomeConditions)
      .where(
        and(eq(outcomeConditions.outcomeId, outcome.id), eq(outcomeConditions.status, 'pending')),
      )
      .limit(1);
    const decision =
      outcome.deadline < today && !pending ? await decideGuarantee(tx, outcome.id, today) : null;
    return { result: OK, decided: decision !== null };
  });
  if (result.decided) await (deps.flush ?? requestFlush)();
  return result.result;
}
