import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction, type RecordingStatus } from '@agency-os/db';
import { withActor } from '@/modules/access';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { scopedEngagement, type EngagementScope } from './authorization';
import type { TranscriptionLanguage } from './transcription/port';
import {
  isRecordingContentType,
  RECORDING_EXTENSIONS,
  type RecordingStorage,
} from './transcription/storage';

const { applications, coreRecordings, organizations } = schema;

export type RecordingSource = 'call' | 'upload';
export type RecordingTrack = 'client' | 'studio';

export type RecordingDeps = {
  contexts: Pick<DbContexts, 'withUserContext'>;
  storage: RecordingStorage;
  flush?: () => Promise<void>;
};

export type CreateRecordingInput = {
  engagementId: string;
  source: RecordingSource;
  consent: boolean;
  contentType: string;
};

export type CreateRecordingResult =
  | { ok: true; recordingId: string; uploads: Array<{ track: RecordingTrack; url: string }> }
  | { ok: false; rule: 'not_found' | 'invalid_input' | 'consent_required' | 'file_type' };

export type ConfirmRecordingResult =
  { ok: true; status: RecordingStatus } | { ok: false; rule: 'not_found' | 'upload_missing' };

export type RetryRecordingResult =
  { ok: true } | { ok: false; rule: 'not_found' | 'invalid_state' };

const createSchema = z.object({
  engagementId: z.uuid(),
  source: z.enum(['call', 'upload']),
  consent: z.boolean(),
  contentType: z.string().max(100),
});

async function leadLanguage(
  tx: DbTransaction,
  scope: EngagementScope,
): Promise<TranscriptionLanguage> {
  const [application] = await tx
    .select({ source: applications.source })
    .from(applications)
    .where(eq(applications.dealId, scope.dealId))
    .orderBy(desc(applications.createdAt))
    .limit(1);
  const locale = (application?.source as { locale?: string } | null)?.locale;
  if (locale === 'en' || locale === 'pt-PT') return locale === 'en' ? 'en' : 'pt';
  const [organization] = await tx
    .select({ locale: organizations.defaultLocale })
    .from(organizations)
    .where(eq(organizations.id, scope.organizationId));
  return organization?.locale === 'en' ? 'en' : 'pt';
}

async function scopedRecording(
  tx: DbTransaction,
  actor: Parameters<typeof scopedEngagement>[1],
  recordingId: string,
) {
  const [recording] = await tx
    .select({
      id: coreRecordings.id,
      engagementId: coreRecordings.engagementId,
      status: coreRecordings.status,
      clientTrackPath: coreRecordings.clientTrackPath,
      studioTrackPath: coreRecordings.studioTrackPath,
    })
    .from(coreRecordings)
    .where(eq(coreRecordings.id, recordingId));
  if (!recording) return null;
  const scope = await scopedEngagement(tx, actor, recording.engagementId, 'write');
  return scope ? { recording, scope } : null;
}

async function emitUploaded(
  tx: DbTransaction,
  scope: EngagementScope,
  recordingId: string,
): Promise<void> {
  await emit(tx, {
    type: 'core.recording.uploaded',
    organizationId: scope.organizationId,
    clientId: scope.clientId,
    payload: { recordingId, engagementId: scope.engagementId, dealId: scope.dealId },
  });
}

export async function createRecording(
  claims: VerifiedClaims,
  input: CreateRecordingInput,
  deps: RecordingDeps,
): Promise<CreateRecordingResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, rule: 'invalid_input' };
  const data = parsed.data;
  if (!data.consent) return { ok: false, rule: 'consent_required' };
  if (!isRecordingContentType(data.contentType)) return { ok: false, rule: 'file_type' };
  const extension = RECORDING_EXTENSIONS[data.contentType];

  const created = await withActor(
    deps.contexts,
    claims,
    async (tx, actor) => {
      const scope = await scopedEngagement(tx, actor, data.engagementId, 'write');
      if (!scope) return null;
      const recordingId = randomUUID();
      const prefix = `${scope.organizationId}/${scope.clientId}/${scope.engagementId}/${recordingId}`;
      const clientTrack = { track: 'client' as const, path: `${prefix}/client.${extension}` };
      const studioTrack =
        data.source === 'call'
          ? { track: 'studio' as const, path: `${prefix}/studio.${extension}` }
          : null;
      const tracks: Array<{ track: RecordingTrack; path: string }> = studioTrack
        ? [clientTrack, studioTrack]
        : [clientTrack];

      await tx.insert(coreRecordings).values({
        id: recordingId,
        organizationId: scope.organizationId,
        clientId: scope.clientId,
        engagementId: scope.engagementId,
        source: data.source,
        clientTrackPath: clientTrack.path,
        studioTrackPath: studioTrack?.path ?? null,
        language: await leadLanguage(tx, scope),
        consentBy: actor.userId,
        consentAt: new Date(),
      });
      await recordAudit(tx, {
        organizationId: scope.organizationId,
        action: 'core.recording.created',
        resourceType: 'core_recording',
        resourceId: recordingId,
        clientId: scope.clientId,
        metadata: { engagementId: scope.engagementId, source: data.source },
      });
      return { recordingId, tracks };
    },
    null,
  );
  if (!created) return { ok: false, rule: 'not_found' };

  const uploads = await Promise.all(
    created.tracks.map(async ({ track, path }) => ({
      track,
      url: await deps.storage.createUploadUrl(path),
    })),
  );
  return { ok: true, recordingId: created.recordingId, uploads };
}

export async function confirmRecordingUpload(
  claims: VerifiedClaims,
  input: { recordingId: string },
  deps: RecordingDeps,
): Promise<ConfirmRecordingResult> {
  if (!z.uuid().safeParse(input.recordingId).success) return { ok: false, rule: 'not_found' };

  const result = await withActor<ConfirmRecordingResult & { emitted?: boolean }>(
    deps.contexts,
    claims,
    async (tx, actor) => {
      const scoped = await scopedRecording(tx, actor, input.recordingId);
      if (!scoped) return { ok: false, rule: 'not_found' };
      const { recording, scope } = scoped;
      if (recording.status !== 'pending_upload') return { ok: true, status: recording.status };

      const paths = [recording.clientTrackPath, recording.studioTrackPath].filter(
        (path): path is string => path !== null,
      );
      const present = await Promise.all(paths.map((path) => deps.storage.exists(path)));
      if (present.includes(false)) return { ok: false, rule: 'upload_missing' };

      const updated = await tx
        .update(coreRecordings)
        .set({ status: 'uploaded' })
        .where(
          and(eq(coreRecordings.id, recording.id), eq(coreRecordings.status, 'pending_upload')),
        )
        .returning({ id: coreRecordings.id });
      if (updated.length > 0) await emitUploaded(tx, scope, recording.id);
      return { ok: true, status: 'uploaded', emitted: updated.length > 0 };
    },
    { ok: false, rule: 'not_found' },
  );

  if (!result.ok) return result;
  if (result.emitted) await (deps.flush ?? requestFlush)();
  return { ok: true, status: result.status };
}

export async function retryRecording(
  claims: VerifiedClaims,
  input: { recordingId: string },
  deps: RecordingDeps,
): Promise<RetryRecordingResult> {
  if (!z.uuid().safeParse(input.recordingId).success) return { ok: false, rule: 'not_found' };

  const result = await withActor<RetryRecordingResult>(
    deps.contexts,
    claims,
    async (tx, actor) => {
      const scoped = await scopedRecording(tx, actor, input.recordingId);
      if (!scoped) return { ok: false, rule: 'not_found' };
      const updated = await tx
        .update(coreRecordings)
        .set({ status: 'uploaded', error: null })
        .where(and(eq(coreRecordings.id, input.recordingId), eq(coreRecordings.status, 'failed')))
        .returning({ id: coreRecordings.id });
      if (updated.length === 0) return { ok: false, rule: 'invalid_state' };
      await emitUploaded(tx, scoped.scope, input.recordingId);
      return { ok: true };
    },
    { ok: false, rule: 'not_found' },
  );

  if (result.ok) await (deps.flush ?? requestFlush)();
  return result;
}
