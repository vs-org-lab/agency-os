import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@agency-os/db';
import { withActor } from '@/modules/access';
import { recordAudit } from '@/modules/audit';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { scopedEngagement } from './authorization';

const { coreEngagements, coreFindings } = schema;

export type CrossReviewResult =
  { ok: true; sameAuthorWarning: boolean } | { ok: false; rule: 'not_found' | 'invalid_input' };

/**
 * The script asks for a review by someone who did not run the audit. The OS records who
 * reviewed and warns, without blocking, when that person wrote most of the findings.
 */
export function recordCrossReview(
  claims: VerifiedClaims,
  input: { engagementId: string; notes: string },
  deps: { contexts: Pick<DbContexts, 'withUserContext'> },
): Promise<CrossReviewResult> {
  const parsed = z
    .object({ engagementId: z.uuid(), notes: z.string().trim().max(5000) })
    .safeParse(input);
  if (!parsed.success) return Promise.resolve({ ok: false, rule: 'invalid_input' });

  return withActor<CrossReviewResult>(
    deps.contexts,
    claims,
    async (tx, actor) => {
      const scope = await scopedEngagement(tx, actor, parsed.data.engagementId, 'write');
      if (!scope) return { ok: false, rule: 'not_found' };

      const authors = await tx
        .select({ authorId: coreFindings.authorId })
        .from(coreFindings)
        .where(eq(coreFindings.engagementId, parsed.data.engagementId));
      const ownFindings = authors.filter((row) => row.authorId === actor.userId).length;
      const sameAuthorWarning = authors.length > 0 && ownFindings * 2 > authors.length;

      await tx
        .update(coreEngagements)
        .set({
          crossReviewBy: actor.userId,
          crossReviewAt: new Date(),
          crossReviewNotes: parsed.data.notes === '' ? null : parsed.data.notes,
        })
        .where(eq(coreEngagements.id, parsed.data.engagementId));
      await recordAudit(tx, {
        organizationId: scope.organizationId,
        action: 'core.cross_review.recorded',
        resourceType: 'core_engagement',
        resourceId: parsed.data.engagementId,
        clientId: scope.clientId,
        metadata: { sameAuthorWarning },
      });
      return { ok: true, sameAuthorWarning };
    },
    { ok: false, rule: 'not_found' },
  );
}
