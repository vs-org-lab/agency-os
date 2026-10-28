import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import type { Locale } from '@agency-os/i18n';
import type { Actor } from '@/modules/access';
import { createInvitationDeps, inviteClientUser, lookupUserIdByEmail } from '@/modules/identity';
import { withUserContext, type VerifiedClaims } from '@/platform/db';
import { buildPrompt } from './assistant/prompts';
import {
  applyBriefingDraft,
  saveBriefingAnswer,
  saveBriefingNote,
  saveEngagementDetails,
  saveTranscript,
  shareBriefing,
} from './briefing';
import { recordCrossReview } from './cross-review';
import { createSupabaseEvidenceStorage } from './evidence/supabase';
import { evidenceUrl, removeFinding, saveFinding, type FindingInput } from './findings';
import { getPortalCore, grantPortalAccess } from './portal';
import { getCoreWorkspace, type CoreWorkspace } from './queries';
import {
  confirmRecordingUpload,
  createRecording,
  retryRecording,
  type CreateRecordingInput,
} from './recordings';
import { transcribeDeps, transcribesInline } from './recording-runtime';
import { saveScores, type ScoreInput } from './scores';
import type { BriefingGuide, OrbitGrid } from './templates/definitions';
import { getActiveTemplate, publishTemplate } from './templates/service';
import { transcribeRecording } from './transcribe';
import { createSupabaseRecordingStorage } from './transcription/supabase-storage';

const { applications, clientMemberships } = schema;

export type StudioSession = { claims: VerifiedClaims };

const contexts = { withUserContext };

function findingDeps() {
  return { contexts, storage: createSupabaseEvidenceStorage() };
}

function recordingDeps() {
  return {
    contexts,
    storage: createSupabaseRecordingStorage(),
    afterUpload: transcribesInline()
      ? async (recordingId: string) => {
          await transcribeRecording(recordingId, transcribeDeps());
        }
      : undefined,
  };
}

export function startCoreRecording(session: StudioSession, input: CreateRecordingInput) {
  return createRecording(session.claims, input, recordingDeps());
}

export function confirmCoreRecording(session: StudioSession, input: { recordingId: string }) {
  return confirmRecordingUpload(session.claims, input, recordingDeps());
}

export function retryCoreRecording(session: StudioSession, input: { recordingId: string }) {
  return retryRecording(session.claims, input, recordingDeps());
}

export function loadCoreWorkspace(
  session: StudioSession,
  dealId: string,
): Promise<CoreWorkspace | null> {
  return withUserContext(session.claims, (tx) => getCoreWorkspace(tx, dealId));
}

export function saveCoreNote(
  session: StudioSession,
  input: { engagementId: string; blockId: string; questionId: string | null; body: string },
) {
  return saveBriefingNote(session.claims, input, { contexts });
}

export function saveCoreAnswer(
  session: StudioSession,
  input: { engagementId: string; blockId: string; questionId: string; answer: string | null },
) {
  return saveBriefingAnswer(session.claims, input, { contexts });
}

export function saveCoreTranscript(
  session: StudioSession,
  input: { engagementId: string; transcript: string },
) {
  return saveTranscript(session.claims, input, { contexts });
}

export function shareCoreBriefing(session: StudioSession, input: { engagementId: string }) {
  return shareBriefing(session.claims, input, { contexts });
}

export function saveCoreDetails(
  session: StudioSession,
  input: { engagementId: string; buyerTestUrl?: string | null; narrative?: string | null },
) {
  return saveEngagementDetails(session.claims, input, { contexts });
}

export function applyCoreBriefingDraft(
  session: StudioSession,
  input: { engagementId: string; text: string; overwrite: boolean },
) {
  return applyBriefingDraft(session.claims, input, { contexts });
}

export function saveCoreFinding(session: StudioSession, input: FindingInput) {
  return saveFinding(session.claims, input, findingDeps());
}

export function removeCoreFinding(session: StudioSession, input: { findingId: string }) {
  return removeFinding(session.claims, input, findingDeps());
}

export function coreEvidenceUrl(session: StudioSession, input: { findingId: string }) {
  return evidenceUrl(session.claims, input, findingDeps());
}

export function saveCoreScores(session: StudioSession, input: ScoreInput) {
  return saveScores(session.claims, input, { contexts });
}

export function recordCoreCrossReview(
  session: StudioSession,
  input: { engagementId: string; notes: string },
) {
  return recordCrossReview(session.claims, input, { contexts });
}

export type CorePrompts = { briefing: string | null; narrative: string };

/** Builds both assistant prompts for the Core of a deal, in the requested locale. */
export async function loadCorePrompts(
  session: StudioSession,
  workspace: CoreWorkspace,
  locale: Locale,
  clientNumbers: string,
): Promise<CorePrompts> {
  const [application] = await withUserContext(session.claims, (tx) =>
    tx
      .select({ answers: applications.answers })
      .from(applications)
      .where(eq(applications.dealId, workspace.dealId))
      .orderBy(desc(applications.createdAt))
      .limit(1),
  );
  const texts =
    (application?.answers as { texts?: Record<string, string> } | undefined)?.texts ?? {};

  return {
    briefing: workspace.briefing.transcript
      ? buildPrompt({
          kind: 'briefing_from_transcript',
          guide: workspace.briefing.guide,
          transcript: workspace.briefing.transcript,
          applicationAnswers: texts,
          locale,
        })
      : null,
    narrative: buildPrompt({
      kind: 'session_narrative',
      findings: workspace.findings.map((finding) => ({
        front: finding.front,
        title: finding.title,
        description: finding.description,
        lane: finding.lane,
        owner: finding.owner,
      })),
      index: workspace.index,
      clientNumbers,
      locale,
    }),
  };
}

export type CoreTemplates = {
  briefing: { version: number; definition: BriefingGuide };
  grid: { version: number; definition: OrbitGrid };
};

export function loadCoreTemplates(
  session: StudioSession & { organizationId: string },
): Promise<CoreTemplates> {
  return withUserContext(session.claims, async (tx) => {
    const briefing = await getActiveTemplate(tx, session.organizationId, 'briefing');
    const grid = await getActiveTemplate(tx, session.organizationId, 'orbit_grid');
    return {
      briefing: { version: briefing.version, definition: briefing.definition },
      grid: { version: grid.version, definition: grid.definition },
    };
  });
}

export function publishCoreTemplate(
  session: StudioSession,
  input: { kind: 'briefing' | 'orbit_grid'; definition: unknown },
) {
  return publishTemplate(session.claims, input, { contexts });
}

/** Invites the deal's decision maker through the identity module and links the contact. */
export async function grantCorePortalAccess(
  session: StudioSession & { actor: Actor },
  dealId: string,
  locale: Locale,
) {
  const invitationDeps = await createInvitationDeps(locale);
  return grantPortalAccess(
    session.claims,
    { dealId },
    {
      contexts,
      invite: async (input) => {
        const result = await inviteClientUser(session, input, invitationDeps);
        if ('error' in result && result.error === 'already_member') {
          const userId = await lookupUserIdByEmail(invitationDeps.contexts, input.email);
          return userId ? { userId } : { error: 'forbidden' };
        }
        if ('error' in result) return result;
        const [membership] = await withUserContext(session.claims, (tx) =>
          tx
            .select({ userId: clientMemberships.userId })
            .from(clientMemberships)
            .where(eq(clientMemberships.id, result.membershipId)),
        );
        return membership ? { userId: membership.userId } : { error: 'forbidden' };
      },
    },
  );
}

export function loadPortalCore(claims: VerifiedClaims, clientId: string) {
  return withUserContext(claims, (tx) => getPortalCore(tx, clientId));
}
