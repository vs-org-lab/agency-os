import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import { orbitIndex } from './domain/orbit-index';
import type { CoreReadiness } from './domain/readiness';
import { getTemplateById } from './templates/service';

const { calls, coreBriefingNotes, coreEngagements, coreFindings, coreScores, documents } = schema;

export async function loadCoreReadiness(
  tx: DbTransaction,
  dealId: string,
): Promise<CoreReadiness | null> {
  const [engagement] = await tx
    .select({
      id: coreEngagements.id,
      gridTemplateId: coreEngagements.gridTemplateId,
      crossReviewAt: coreEngagements.crossReviewAt,
    })
    .from(coreEngagements)
    .where(eq(coreEngagements.dealId, dealId));
  if (!engagement) return null;

  const [briefing] = await tx
    .select({ total: count() })
    .from(coreBriefingNotes)
    .where(
      and(
        eq(coreBriefingNotes.engagementId, engagement.id),
        sql`trim(${coreBriefingNotes.body}) <> ''`,
      ),
    );
  const [withoutEvidence] = await tx
    .select({ total: count() })
    .from(coreFindings)
    .where(and(eq(coreFindings.engagementId, engagement.id), isNull(coreFindings.evidenceKind)));
  const [internal] = await tx
    .select({ total: count() })
    .from(coreFindings)
    .where(and(eq(coreFindings.engagementId, engagement.id), eq(coreFindings.owner, 'internal')));
  const scores = await tx
    .select({
      front: coreScores.front,
      criterionId: coreScores.criterionId,
      points: coreScores.points,
    })
    .from(coreScores)
    .where(eq(coreScores.engagementId, engagement.id));
  const grid = await getTemplateById(tx, engagement.gridTemplateId, 'orbit_grid');
  const presentations = await tx
    .select({ status: documents.status })
    .from(documents)
    .where(and(eq(documents.dealId, dealId), eq(documents.kind, 'figma_presentation')));
  const [session] = await tx
    .select({ total: count() })
    .from(calls)
    .where(
      and(
        eq(calls.dealId, dealId),
        eq(calls.kind, 'proposal_session'),
        inArray(calls.status, ['scheduled', 'completed']),
      ),
    );

  return {
    briefingHasContent: (briefing?.total ?? 0) > 0,
    frontsScored: orbitIndex(grid, scores).every((row) => row.complete),
    findingsWithoutEvidence: withoutEvidence?.total ?? 0,
    internalItems: internal?.total ?? 0,
    crossReviewed: engagement.crossReviewAt !== null,
    presentationAttached: presentations.length > 0,
    proposalSessionScheduled: (session?.total ?? 0) > 0,
    presentationShared: presentations.some((presentation) => presentation.status === 'with_client'),
  };
}
