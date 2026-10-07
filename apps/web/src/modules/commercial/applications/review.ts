import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { canWriteClient, withActor } from '../authorization';
import { applyStageChange } from '../pipeline/service';
import { addTimelineEntry } from '../timeline';

const { applications } = schema;

export type ReviewResult =
  { ok: true } | { ok: false; rule: 'not_found' | 'already_reviewed' | 'stage_refused' };

class StageRefusedError extends Error {
  constructor() {
    super('Queue B rejection was refused by the pipeline');
    this.name = 'StageRefusedError';
  }
}

export async function reviewQueueB(
  claims: VerifiedClaims,
  input: { applicationId: string; decision: 'a' | 'c' },
  deps: { contexts: Pick<DbContexts, 'withUserContext'>; flush?: () => Promise<void> },
): Promise<ReviewResult> {
  if (!z.uuid().safeParse(input.applicationId).success) return { ok: false, rule: 'not_found' };

  const result = await withActor<ReviewResult>(
    deps.contexts,
    claims,
    async (tx, actor) => {
      const [application] = await tx
        .select({
          path: applications.path,
          reviewDecision: applications.reviewDecision,
          dealId: applications.dealId,
          clientId: applications.clientId,
          organizationId: applications.organizationId,
        })
        .from(applications)
        .where(eq(applications.id, input.applicationId));
      if (!application || application.path !== 'b') return { ok: false, rule: 'not_found' };
      if (!(await canWriteClient(tx, actor, application.clientId))) {
        return { ok: false, rule: 'not_found' };
      }
      if (application.reviewDecision !== null) return { ok: false, rule: 'already_reviewed' };

      const updated = await tx
        .update(applications)
        .set({ reviewDecision: input.decision, reviewedAt: new Date(), reviewedBy: actor.userId })
        .where(and(eq(applications.id, input.applicationId), isNull(applications.reviewDecision)))
        .returning({ id: applications.id });
      if (updated.length === 0) return { ok: false, rule: 'already_reviewed' };

      if (input.decision === 'c') {
        const change = await applyStageChange(tx, {
          dealId: application.dealId,
          to: 'X.4',
          reason: 'path_c',
          actor: { userId: actor.userId, isFounder: actor.roles.includes('founder') },
        });
        if (!change.ok) throw new StageRefusedError();
      }
      await addTimelineEntry(tx, {
        organizationId: application.organizationId,
        clientId: application.clientId,
        dealId: application.dealId,
        kind: 'application_reviewed',
        summary: { decision: input.decision },
        itemType: 'application',
        itemId: input.applicationId,
        actorUserId: actor.userId,
      });
      await recordAudit(tx, {
        organizationId: application.organizationId,
        action: 'application.reviewed',
        resourceType: 'application',
        resourceId: input.applicationId,
        clientId: application.clientId,
        metadata: { decision: input.decision },
      });
      await emit(tx, {
        type: 'commercial.application.reviewed',
        organizationId: application.organizationId,
        clientId: application.clientId,
        payload: {
          applicationId: input.applicationId,
          dealId: application.dealId,
          decision: input.decision,
        },
      });
      return { ok: true };
    },
    { ok: false, rule: 'not_found' },
  ).catch((error: unknown): ReviewResult => {
    if (error instanceof StageRefusedError) return { ok: false, rule: 'stage_refused' };
    throw error;
  });

  if (result.ok) await (deps.flush ?? requestFlush)();
  return result;
}
