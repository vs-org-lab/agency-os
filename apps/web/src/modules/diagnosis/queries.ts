import { and, asc, eq, isNotNull } from 'drizzle-orm';
import {
  schema,
  type CoreLevel,
  type DbTransaction,
  type DocumentStatus,
  type EvidenceKind,
  type FindingOwner,
  type OrbitFront,
  type RoadmapLane,
} from '@agency-os/db';
import { getBriefing, type BriefingView } from './briefing';
import { orbitIndex, type OrbitIndexRow } from './domain/orbit-index';
import type { CoreReadiness } from './domain/readiness';
import { loadCoreReadiness } from './readiness-facts';
import type { OrbitGrid } from './templates/definitions';
import { getTemplateById } from './templates/service';

const { contacts, coreEngagements, coreFindings, coreScores, documents } = schema;

export type FindingSummary = {
  id: string;
  front: OrbitFront;
  title: string;
  description: string;
  evidenceKind: EvidenceKind | null;
  evidenceValue: string | null;
  evidenceNote: string | null;
  impact: CoreLevel;
  effort: CoreLevel;
  lane: RoadmapLane;
  owner: FindingOwner;
  bringToCall: boolean;
  authorId: string | null;
};

export type RoadmapView = Record<RoadmapLane, FindingSummary[]>;

export type ScoreRow = {
  front: OrbitFront;
  criterionId: string;
  points: number;
  justification: string;
};

export type CoreDocument = {
  id: string;
  title: string;
  url: string;
  status: DocumentStatus;
  sharedAt: Date | null;
};

export type CoreWorkspace = {
  engagementId: string;
  dealId: string;
  briefing: BriefingView;
  buyerTestUrl: string | null;
  narrative: string | null;
  grid: OrbitGrid;
  scores: ScoreRow[];
  index: OrbitIndexRow[];
  findings: FindingSummary[];
  roadmap: RoadmapView;
  internalItems: number;
  crossReview: { by: string; at: Date; notes: string | null } | null;
  documents: CoreDocument[];
  portalAccess: boolean;
  readiness: CoreReadiness;
};

export async function getCoreWorkspace(
  tx: DbTransaction,
  dealId: string,
): Promise<CoreWorkspace | null> {
  const [engagement] = await tx
    .select({
      id: coreEngagements.id,
      clientId: coreEngagements.clientId,
      gridTemplateId: coreEngagements.gridTemplateId,
      buyerTestUrl: coreEngagements.buyerTestUrl,
      narrative: coreEngagements.narrative,
      crossReviewBy: coreEngagements.crossReviewBy,
      crossReviewAt: coreEngagements.crossReviewAt,
      crossReviewNotes: coreEngagements.crossReviewNotes,
    })
    .from(coreEngagements)
    .where(eq(coreEngagements.dealId, dealId));
  if (!engagement) return null;

  const briefing = await getBriefing(tx, engagement.id);
  const grid = await getTemplateById(tx, engagement.gridTemplateId, 'orbit_grid');
  const readiness = await loadCoreReadiness(tx, dealId);
  if (!briefing || !readiness) return null;

  const findings: FindingSummary[] = await tx
    .select({
      id: coreFindings.id,
      front: coreFindings.front,
      title: coreFindings.title,
      description: coreFindings.description,
      evidenceKind: coreFindings.evidenceKind,
      evidenceValue: coreFindings.evidenceValue,
      evidenceNote: coreFindings.evidenceNote,
      impact: coreFindings.impact,
      effort: coreFindings.effort,
      lane: coreFindings.lane,
      owner: coreFindings.owner,
      bringToCall: coreFindings.bringToCall,
      authorId: coreFindings.authorId,
    })
    .from(coreFindings)
    .where(eq(coreFindings.engagementId, engagement.id))
    .orderBy(asc(coreFindings.position), asc(coreFindings.createdAt));
  const scores: ScoreRow[] = await tx
    .select({
      front: coreScores.front,
      criterionId: coreScores.criterionId,
      points: coreScores.points,
      justification: coreScores.justification,
    })
    .from(coreScores)
    .where(eq(coreScores.engagementId, engagement.id));
  const presentations: CoreDocument[] = await tx
    .select({
      id: documents.id,
      title: documents.title,
      url: documents.url,
      status: documents.status,
      sharedAt: documents.sharedAt,
    })
    .from(documents)
    .where(eq(documents.dealId, dealId))
    .orderBy(asc(documents.createdAt));

  const [portalContact] = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.clientId, engagement.clientId), isNotNull(contacts.portalUserId)))
    .limit(1);

  const roadmap: RoadmapView = { days_30: [], days_90: [], months_12: [] };
  for (const finding of findings) roadmap[finding.lane].push(finding);

  return {
    engagementId: engagement.id,
    dealId,
    briefing,
    buyerTestUrl: engagement.buyerTestUrl,
    narrative: engagement.narrative,
    grid,
    scores,
    index: orbitIndex(grid, scores),
    findings,
    roadmap,
    internalItems: findings.filter((finding) => finding.owner === 'internal').length,
    crossReview:
      engagement.crossReviewBy && engagement.crossReviewAt
        ? {
            by: engagement.crossReviewBy,
            at: engagement.crossReviewAt,
            notes: engagement.crossReviewNotes,
          }
        : null,
    documents: presentations,
    portalAccess: portalContact !== undefined,
    readiness,
  };
}
