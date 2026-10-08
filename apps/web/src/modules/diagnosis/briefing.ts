import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction } from '@agency-os/db';
import { withActor } from '@/modules/access';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { scopedEngagement } from './authorization';
import type { BriefingGuide } from './templates/definitions';
import { getTemplateById } from './templates/service';

const { coreBriefingNotes, coreEngagements } = schema;

export const MAX_NOTE_LENGTH = 20_000;
export const MAX_TRANSCRIPT_LENGTH = 200_000;

export type DiagnosisDeps = {
  contexts: Pick<DbContexts, 'withUserContext'>;
  flush?: () => Promise<void>;
};

export type BriefingNote = {
  blockId: string;
  questionId: string | null;
  body: string;
  authorId: string | null;
  updatedAt: Date;
};

export type BriefingView = {
  guide: BriefingGuide;
  notes: BriefingNote[];
  transcript: string | null;
  sharedAt: Date | null;
};

const noteSchema = z.object({
  engagementId: z.uuid(),
  blockId: z.string().min(1).max(40),
  questionId: z.string().min(1).max(40).nullable(),
  body: z.string().max(MAX_NOTE_LENGTH),
});

function slotExists(guide: BriefingGuide, blockId: string, questionId: string | null): boolean {
  const block = guide.blocks.find((entry) => entry.id === blockId);
  if (!block) return false;
  return questionId === null || block.questions.some((question) => question.id === questionId);
}

export function saveBriefingNote(
  claims: VerifiedClaims,
  input: { engagementId: string; blockId: string; questionId: string | null; body: string },
  deps: DiagnosisDeps,
): Promise<{ ok: true; savedAt: Date } | { ok: false; rule: 'not_found' | 'invalid_input' }> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return Promise.resolve({ ok: false, rule: 'invalid_input' });
  const { engagementId, blockId, questionId, body } = parsed.data;

  return withActor(
    deps.contexts,
    claims,
    async (tx, actor) => {
      const scope = await scopedEngagement(tx, actor, engagementId, 'write');
      if (!scope) return { ok: false as const, rule: 'not_found' as const };
      const guide = await getTemplateById(tx, scope.briefingTemplateId, 'briefing');
      if (!slotExists(guide, blockId, questionId)) {
        return { ok: false as const, rule: 'invalid_input' as const };
      }

      const savedAt = new Date();
      await tx
        .insert(coreBriefingNotes)
        .values({
          organizationId: scope.organizationId,
          clientId: scope.clientId,
          engagementId,
          blockId,
          questionId: questionId ?? '',
          body,
          authorId: actor.userId,
        })
        .onConflictDoUpdate({
          target: [
            coreBriefingNotes.engagementId,
            coreBriefingNotes.blockId,
            coreBriefingNotes.questionId,
          ],
          set: { body, authorId: actor.userId, updatedAt: savedAt },
        });
      return { ok: true as const, savedAt };
    },
    { ok: false as const, rule: 'not_found' as const },
  );
}

export function saveTranscript(
  claims: VerifiedClaims,
  input: { engagementId: string; transcript: string },
  deps: DiagnosisDeps,
): Promise<{ ok: true } | { ok: false; rule: 'not_found' | 'invalid_input' }> {
  const valid =
    input.transcript.length <= MAX_TRANSCRIPT_LENGTH &&
    z.uuid().safeParse(input.engagementId).success;
  if (!valid) return Promise.resolve({ ok: false, rule: 'invalid_input' });

  return withActor(
    deps.contexts,
    claims,
    async (tx, actor) => {
      const scope = await scopedEngagement(tx, actor, input.engagementId, 'write');
      if (!scope) return { ok: false as const, rule: 'not_found' as const };
      await tx
        .update(coreEngagements)
        .set({ transcript: input.transcript.trim() === '' ? null : input.transcript })
        .where(eq(coreEngagements.id, input.engagementId));
      return { ok: true as const };
    },
    { ok: false as const, rule: 'not_found' as const },
  );
}

export async function shareBriefing(
  claims: VerifiedClaims,
  input: { engagementId: string },
  deps: DiagnosisDeps,
): Promise<{ ok: true } | { ok: false; rule: 'not_found' | 'briefing_empty' }> {
  if (!z.uuid().safeParse(input.engagementId).success) return { ok: false, rule: 'not_found' };

  const result = await withActor(
    deps.contexts,
    claims,
    async (tx, actor) => {
      const scope = await scopedEngagement(tx, actor, input.engagementId, 'write');
      if (!scope) return { ok: false as const, rule: 'not_found' as const };
      const [content] = await tx
        .select({ id: coreBriefingNotes.id })
        .from(coreBriefingNotes)
        .where(
          and(
            eq(coreBriefingNotes.engagementId, input.engagementId),
            sql`trim(${coreBriefingNotes.body}) <> ''`,
          ),
        )
        .limit(1);
      if (!content) return { ok: false as const, rule: 'briefing_empty' as const };

      const shared = await tx
        .update(coreEngagements)
        .set({ briefingSharedAt: new Date() })
        .where(
          and(eq(coreEngagements.id, input.engagementId), isNull(coreEngagements.briefingSharedAt)),
        )
        .returning({ id: coreEngagements.id });
      if (shared.length === 0) return { ok: true as const, emitted: false };

      await recordAudit(tx, {
        organizationId: scope.organizationId,
        action: 'core.briefing.shared',
        resourceType: 'core_engagement',
        resourceId: input.engagementId,
        clientId: scope.clientId,
        metadata: {},
      });
      await emit(tx, {
        type: 'core.briefing.shared',
        organizationId: scope.organizationId,
        clientId: scope.clientId,
        payload: { engagementId: input.engagementId, dealId: scope.dealId },
      });
      return { ok: true as const, emitted: true };
    },
    { ok: false as const, rule: 'not_found' as const },
  );

  if (!result.ok) return result;
  if (result.emitted) await (deps.flush ?? requestFlush)();
  return { ok: true };
}

export async function getBriefing(
  tx: DbTransaction,
  engagementId: string,
): Promise<BriefingView | null> {
  const [engagement] = await tx
    .select({
      briefingTemplateId: coreEngagements.briefingTemplateId,
      transcript: coreEngagements.transcript,
      sharedAt: coreEngagements.briefingSharedAt,
    })
    .from(coreEngagements)
    .where(eq(coreEngagements.id, engagementId));
  if (!engagement) return null;

  const rows = await tx
    .select({
      blockId: coreBriefingNotes.blockId,
      questionId: coreBriefingNotes.questionId,
      body: coreBriefingNotes.body,
      authorId: coreBriefingNotes.authorId,
      updatedAt: coreBriefingNotes.updatedAt,
    })
    .from(coreBriefingNotes)
    .where(eq(coreBriefingNotes.engagementId, engagementId))
    .orderBy(asc(coreBriefingNotes.blockId), asc(coreBriefingNotes.questionId));

  return {
    guide: await getTemplateById(tx, engagement.briefingTemplateId, 'briefing'),
    notes: rows.map((row) => ({
      ...row,
      questionId: row.questionId === '' ? null : row.questionId,
    })),
    transcript: engagement.transcript,
    sharedAt: engagement.sharedAt,
  };
}
