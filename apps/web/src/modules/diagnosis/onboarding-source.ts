import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import type { BriefingGuide, BriefingBlock } from './templates/definitions';
import { findActiveTemplate, getTemplateById } from './templates/service';

const { coreBriefingNotes, coreEngagements, proposalOptions, proposals } = schema;

/**
 * What the client's onboarding is worked out from: the requests and structured questions of the
 * organisation's active briefing template, so a newly published version reaches clients whose Core
 * started on an older one, with this client's latest answers and accepted scope.
 */
export type OnboardingSource = {
  organizationId: string;
  clientId: string;
  engagementId: string;
  guide: BriefingGuide;
  /** Structured briefing answers by question id. */
  answers: Map<string, string>;
  /** Codes of the modules in the accepted option of the engagement's proposal. */
  modules: Set<string>;
};

type EngagementRef = {
  id: string;
  organizationId: string;
  clientId: string;
  dealId: string;
  briefingTemplateId: string;
};

async function sourceOf(tx: DbTransaction, engagement: EngagementRef): Promise<OnboardingSource> {
  const [active, notes, accepted] = await Promise.all([
    findActiveTemplate(tx, engagement.organizationId, 'briefing'),
    tx
      .select({ questionId: coreBriefingNotes.questionId, answer: coreBriefingNotes.answer })
      .from(coreBriefingNotes)
      .where(
        and(eq(coreBriefingNotes.engagementId, engagement.id), isNotNull(coreBriefingNotes.answer)),
      ),
    tx
      .select({ modules: proposalOptions.modules })
      .from(proposals)
      .innerJoin(proposalOptions, eq(proposalOptions.id, proposals.acceptedOptionId))
      .where(and(eq(proposals.dealId, engagement.dealId), eq(proposals.status, 'accepted')))
      .orderBy(desc(proposals.acceptedAt))
      .limit(1),
  ]);
  const guide =
    active?.definition ?? (await getTemplateById(tx, engagement.briefingTemplateId, 'briefing'));
  return {
    organizationId: engagement.organizationId,
    clientId: engagement.clientId,
    engagementId: engagement.id,
    guide,
    answers: new Map(
      notes.flatMap((note) => (note.answer ? [[note.questionId, note.answer] as const] : [])),
    ),
    modules: new Set((accepted[0]?.modules ?? []).map((module) => module.code)),
  };
}

const ENGAGEMENT_COLUMNS = {
  id: coreEngagements.id,
  organizationId: coreEngagements.organizationId,
  clientId: coreEngagements.clientId,
  dealId: coreEngagements.dealId,
  briefingTemplateId: coreEngagements.briefingTemplateId,
};

/** The client's latest Core engagement as an onboarding source; read once the caller is authorised. */
export async function latestOnboardingSource(
  tx: DbTransaction,
  clientId: string,
): Promise<OnboardingSource | null> {
  const [engagement] = await tx
    .select(ENGAGEMENT_COLUMNS)
    .from(coreEngagements)
    .where(eq(coreEngagements.clientId, clientId))
    .orderBy(desc(coreEngagements.createdAt), desc(coreEngagements.id))
    .limit(1);
  return engagement ? sourceOf(tx, engagement) : null;
}

/** What the team sees of the onboarding while filling the briefing of one engagement. */
export type CoreOnboarding = {
  /** The structured questions the requests can depend on, with the block they belong to. */
  questions: { blockId: string; question: BriefingBlock['questions'][number] }[];
  requests: BriefingGuide['onboarding'];
  answers: Record<string, string>;
  modules: string[];
};

export async function coreOnboarding(
  tx: DbTransaction,
  engagementId: string,
): Promise<CoreOnboarding | null> {
  const [engagement] = await tx
    .select(ENGAGEMENT_COLUMNS)
    .from(coreEngagements)
    .where(eq(coreEngagements.id, engagementId));
  if (!engagement) return null;
  const source = await sourceOf(tx, engagement);
  return {
    questions: source.guide.blocks.flatMap((block) =>
      block.questions.flatMap((question) =>
        question.answer ? [{ blockId: block.id, question }] : [],
      ),
    ),
    requests: source.guide.onboarding,
    answers: Object.fromEntries(source.answers),
    modules: [...source.modules],
  };
}
