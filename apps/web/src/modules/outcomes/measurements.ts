import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { requestFlush } from '@/modules/events';
import type { VerifiedClaims } from '@/platform/db';
import {
  INVALID_INPUT,
  lisbonDay,
  NOT_FOUND,
  nowOf,
  OK,
  outcomeWriter,
  type NotFound,
  type OutcomesDeps,
} from './access';
import { decideGuarantee, lockOutcome } from './guarantee';
import { metricValue } from './outcomes';

const { outcomeMeasurements, projectOutcomes } = schema;

const measurementSchema = z.object({
  outcomeId: z.uuid(),
  measuredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: metricValue,
  note: z.string().trim().max(500).optional(),
});

/**
 * RF-122: the team records the metric's value on a date, at most today; the same date replaces
 * the earlier value. A value that reaches the target closes an active guarantee (RN-73).
 */
export async function recordMeasurement(
  claims: VerifiedClaims,
  input: { outcomeId: string; measuredOn: string; value: string; note?: string },
  deps: OutcomesDeps,
): Promise<typeof OK | NotFound | typeof INVALID_INPUT> {
  const parsed = measurementSchema.safeParse(input);
  if (!parsed.success)
    return z.uuid().safeParse(input.outcomeId).success ? INVALID_INPUT : NOT_FOUND;
  const data = parsed.data;
  const [owner] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ clientId: projectOutcomes.clientId })
      .from(projectOutcomes)
      .where(eq(projectOutcomes.id, data.outcomeId)),
  );
  if (!owner) return NOT_FOUND;
  const actor = await outcomeWriter(claims, owner.clientId, deps);
  if (!actor) return NOT_FOUND;
  const today = lisbonDay(nowOf(deps));
  const valid = new Date(`${data.measuredOn}T00:00:00Z`);
  if (Number.isNaN(valid.getTime()) || data.measuredOn > today) return INVALID_INPUT;

  const decided = await deps.contexts.withSystemContext(async (tx) => {
    const outcome = await lockOutcome(tx, data.outcomeId);
    if (!outcome) return false;
    const note = data.note || null;
    await tx
      .insert(outcomeMeasurements)
      .values({
        organizationId: outcome.organizationId,
        clientId: outcome.clientId,
        outcomeId: outcome.id,
        measuredOn: data.measuredOn,
        value: data.value,
        note,
        recordedBy: actor.userId,
      })
      .onConflictDoUpdate({
        target: [outcomeMeasurements.outcomeId, outcomeMeasurements.measuredOn],
        set: { value: data.value, note, recordedBy: actor.userId },
      });
    await recordAudit(tx, {
      organizationId: outcome.organizationId,
      action: 'outcome.measurement_recorded',
      resourceType: 'project_outcome',
      resourceId: outcome.id,
      clientId: outcome.clientId,
      metadata: { measuredOn: data.measuredOn },
    });
    if (outcome.guaranteeStatus !== 'active') return false;
    return (await decideGuarantee(tx, outcome.id, today)) !== null;
  });
  if (decided) await (deps.flush ?? requestFlush)();
  return OK;
}
