import { and, eq } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import type { VerifiedClaims } from '@/platform/db';
import {
  academyLearner,
  academyWriter,
  isUuid,
  NOT_FOUND,
  OK,
  type AcademyDeps,
  type NotFound,
} from './access';

const { academyChecklistSteps, academyItems, academyStepChecks } = schema;

/**
 * Marks a checklist step done or not. The client's room members do it on published lists; the
 * room's writers on any list. A step done stays with whoever marked it first.
 */
export async function setStepCheck(
  claims: VerifiedClaims,
  input: { stepId: string; done: boolean },
  deps: AcademyDeps,
): Promise<typeof OK | NotFound> {
  if (!isUuid(input.stepId)) return NOT_FOUND;
  const [step] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({
        organizationId: academyChecklistSteps.organizationId,
        clientId: academyChecklistSteps.clientId,
        status: academyItems.status,
      })
      .from(academyChecklistSteps)
      .innerJoin(academyItems, eq(academyItems.id, academyChecklistSteps.itemId))
      .where(eq(academyChecklistSteps.id, input.stepId)),
  );
  if (!step) return NOT_FOUND;
  const allowed =
    claims.user_kind === 'client'
      ? step.status === 'published' && (await academyLearner(claims, step.clientId, deps))
      : (await academyWriter(claims, step.clientId, deps)) !== null;
  if (!allowed) return NOT_FOUND;

  await deps.contexts.withSystemContext(async (tx) => {
    const changed = input.done
      ? await tx
          .insert(academyStepChecks)
          .values({
            stepId: input.stepId,
            organizationId: step.organizationId,
            clientId: step.clientId,
            checkedBy: claims.sub,
          })
          .onConflictDoNothing()
          .returning({ stepId: academyStepChecks.stepId })
      : await tx
          .delete(academyStepChecks)
          .where(
            and(
              eq(academyStepChecks.stepId, input.stepId),
              eq(academyStepChecks.clientId, step.clientId),
            ),
          )
          .returning({ stepId: academyStepChecks.stepId });
    if (changed.length === 0) return;
    await recordAudit(tx, {
      organizationId: step.organizationId,
      action: input.done ? 'academy.step_checked' : 'academy.step_unchecked',
      resourceType: 'academy_step',
      resourceId: input.stepId,
      clientId: step.clientId,
    });
  });
  return OK;
}
