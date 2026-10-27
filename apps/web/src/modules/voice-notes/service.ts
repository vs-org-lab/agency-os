import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction, type VoiceNoteStatus } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import { MEDIA_LINK_TTL_SECONDS, type BucketStorage } from '@/platform/bucket-storage';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import {
  createVoiceNoteSchema,
  MAX_VOICE_NOTE_BYTES,
  VOICE_NOTE_EXTENSIONS,
  voiceNoteContentType,
  type CreateVoiceNoteInput,
  type VoiceNoteTargetKind,
  type VoiceNoteView,
} from './domain';

const { projects, voiceNotes } = schema;

/** The founder, the client's managers and the project's freelancers comment on proofs. */
const COMMENTING_ROLES = sql`array['founder', 'project_manager', 'freelancer']::app.org_role[]`;

export type VoiceNoteDeps = {
  contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'>;
  storage: BucketStorage;
  flush?: () => Promise<void>;
  /** Runs the transcription in the request when no background worker is available. */
  afterUpload?: (voiceNoteId: string) => Promise<void>;
};

export type CreateVoiceNoteResult =
  | { ok: true; voiceNoteId: string; uploadUrl: string }
  | { ok: false; rule: 'not_found' | 'invalid_input' | 'file_type' | 'duplicate' };

export type ConfirmVoiceNoteResult =
  | { ok: true; status: VoiceNoteStatus }
  | { ok: false; rule: 'not_found' | 'upload_missing' | 'too_large' };

type TargetScope = { clientId: string; projectId: string };
type TargetRow = { client_id: string; project_id: string };

/**
 * The target a note is attached to, when the caller may attach to it: their own proof comment
 * (the team in a commenting role, or a client user through the portal view) or, for the client's
 * decision maker, an approval of a file version still open for a decision.
 */
async function authorizedTarget(
  tx: DbTransaction,
  claims: VerifiedClaims,
  input: { targetKind: VoiceNoteTargetKind; targetId: string },
): Promise<TargetScope | null> {
  let rows: TargetRow[];
  if (input.targetKind === 'approval_change_request') {
    if (claims.user_kind !== 'client') return null;
    rows = await tx.execute<TargetRow>(sql`
      select a.client_id, a.project_id from public.portal_approvals a
      where a.id = ${input.targetId}::uuid and a.subject_type = 'file_version'
        and a.status in ('pending', 'changes_requested')
        and app.is_client_member(a.client_id, array['decision_maker']::app.client_role[])
    `);
  } else if (claims.user_kind === 'client') {
    rows = await tx.execute<TargetRow>(sql`
      select c.client_id, c.project_id from public.portal_proof_comments c
      where c.id = ${input.targetId}::uuid and c.author_id = ${claims.sub}::uuid
    `);
  } else {
    rows = await tx.execute<TargetRow>(sql`
      select c.client_id, c.project_id from public.proof_comments c
      where c.id = ${input.targetId}::uuid and c.author_id = ${claims.sub}::uuid
        and app.has_org_role(c.organization_id, ${COMMENTING_ROLES})
    `);
  }
  const row = rows[0];
  return row ? { clientId: row.client_id, projectId: row.project_id } : null;
}

export async function createVoiceNote(
  claims: VerifiedClaims,
  input: CreateVoiceNoteInput,
  deps: VoiceNoteDeps,
): Promise<CreateVoiceNoteResult> {
  const parsed = createVoiceNoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, rule: 'invalid_input' };
  const data = parsed.data;
  const contentType = voiceNoteContentType(data.contentType);
  if (!contentType) return { ok: false, rule: 'file_type' };

  const target = await deps.contexts.withUserContext(claims, (tx) =>
    authorizedTarget(tx, claims, data),
  );
  if (!target) return { ok: false, rule: 'not_found' };

  const created = await deps.contexts.withSystemContext(async (tx) => {
    const [project] = await tx
      .select({ organizationId: projects.organizationId })
      .from(projects)
      .where(and(eq(projects.id, target.projectId), eq(projects.clientId, target.clientId)));
    if (!project) return null;
    const [existing] = await tx
      .select({ id: voiceNotes.id })
      .from(voiceNotes)
      .where(
        and(
          eq(voiceNotes.targetKind, data.targetKind),
          eq(voiceNotes.targetId, data.targetId),
          eq(voiceNotes.authorId, claims.sub),
          ne(voiceNotes.status, 'failed'),
        ),
      );
    if (existing) return 'duplicate' as const;

    const noteId = crypto.randomUUID();
    const path = [
      project.organizationId,
      target.clientId,
      target.projectId,
      `${noteId}.${VOICE_NOTE_EXTENSIONS[contentType]}`,
    ].join('/');
    await tx.insert(voiceNotes).values({
      id: noteId,
      organizationId: project.organizationId,
      clientId: target.clientId,
      projectId: target.projectId,
      targetKind: data.targetKind,
      targetId: data.targetId,
      authorId: claims.sub,
      path,
      contentType,
      durationSeconds: data.durationSeconds,
    });
    return { voiceNoteId: noteId, path };
  });
  if (!created) return { ok: false, rule: 'not_found' };
  if (created === 'duplicate') return { ok: false, rule: 'duplicate' };

  return {
    ok: true,
    voiceNoteId: created.voiceNoteId,
    uploadUrl: await deps.storage.createUploadUrl(created.path),
  };
}

export async function confirmVoiceNote(
  claims: VerifiedClaims,
  input: { voiceNoteId: string },
  deps: VoiceNoteDeps,
): Promise<ConfirmVoiceNoteResult> {
  if (!z.uuid().safeParse(input.voiceNoteId).success) return { ok: false, rule: 'not_found' };

  const result = await deps.contexts.withSystemContext<
    ConfirmVoiceNoteResult & { emitted?: boolean }
  >(async (tx) => {
    const [note] = await tx
      .select()
      .from(voiceNotes)
      .where(and(eq(voiceNotes.id, input.voiceNoteId), eq(voiceNotes.authorId, claims.sub)))
      .for('update');
    if (!note) return { ok: false, rule: 'not_found' };
    if (note.status !== 'pending') return { ok: true, status: note.status };

    const size = await deps.storage.objectSize(note.path);
    if (size === null) return { ok: false, rule: 'upload_missing' };
    if (size > MAX_VOICE_NOTE_BYTES) {
      await deps.storage.remove([note.path]);
      await tx.update(voiceNotes).set({ status: 'failed' }).where(eq(voiceNotes.id, note.id));
      return { ok: false, rule: 'too_large' };
    }

    await tx.update(voiceNotes).set({ status: 'uploaded' }).where(eq(voiceNotes.id, note.id));
    await recordAudit(tx, {
      organizationId: note.organizationId,
      action: 'voice_note.uploaded',
      resourceType: 'voice_note',
      resourceId: note.id,
      clientId: note.clientId,
      metadata: { targetKind: note.targetKind, targetId: note.targetId },
    });
    await emit(tx, {
      type: 'voice_notes.note.uploaded',
      organizationId: note.organizationId,
      clientId: note.clientId,
      payload: { voiceNoteId: note.id, projectId: note.projectId },
    });
    return { ok: true, status: 'uploaded', emitted: true };
  });

  if (!result.ok) return result;
  if (result.emitted) {
    await (deps.flush ?? requestFlush)();
    await deps.afterUpload?.(input.voiceNoteId);
  }
  return { ok: true, status: result.status };
}

type VisibleNote = {
  id: string;
  targetId: string;
  authorId: string | null;
  status: VoiceNoteStatus;
  transcript: string | null;
  durationSeconds: number;
  createdAt: Date;
};

/**
 * The notes attached to the given comments or approvals that the caller may read: the team through
 * row level security, a client user through the portal view. Audio is served by signed links.
 */
export async function listVoiceNotes(
  claims: VerifiedClaims,
  input: { targetKind: VoiceNoteTargetKind; targetIds: string[] },
  deps: VoiceNoteDeps,
): Promise<VoiceNoteView[]> {
  const targetIds = input.targetIds.filter((id) => z.uuid().safeParse(id).success);
  if (targetIds.length === 0) return [];

  const visible = await deps.contexts.withUserContext(
    claims,
    async (tx): Promise<VisibleNote[]> => {
      if (claims.user_kind === 'client') {
        const rows = await tx.execute<{
          id: string;
          target_id: string;
          author_id: string | null;
          status: VoiceNoteStatus;
          transcript: string | null;
          duration_seconds: number;
          created_at: Date | string;
        }>(sql`
        select id, target_id, author_id, status, transcript, duration_seconds, created_at
        from public.portal_voice_notes
        where target_kind = ${input.targetKind}::app.voice_note_target
          and target_id in (${sql.join(
            targetIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})
        order by created_at
      `);
        return rows.map((row) => ({
          id: row.id,
          targetId: row.target_id,
          authorId: row.author_id,
          status: row.status,
          transcript: row.transcript,
          durationSeconds: row.duration_seconds,
          createdAt: new Date(row.created_at),
        }));
      }
      return tx
        .select({
          id: voiceNotes.id,
          targetId: voiceNotes.targetId,
          authorId: voiceNotes.authorId,
          status: voiceNotes.status,
          transcript: voiceNotes.transcript,
          durationSeconds: voiceNotes.durationSeconds,
          createdAt: voiceNotes.createdAt,
        })
        .from(voiceNotes)
        .where(
          and(
            eq(voiceNotes.targetKind, input.targetKind),
            inArray(voiceNotes.targetId, targetIds),
            ne(voiceNotes.status, 'pending'),
          ),
        )
        .orderBy(voiceNotes.createdAt);
    },
  );
  if (visible.length === 0) return [];

  const paths = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ id: voiceNotes.id, path: voiceNotes.path })
      .from(voiceNotes)
      .where(
        inArray(
          voiceNotes.id,
          visible.map((note) => note.id),
        ),
      ),
  );
  const pathById = new Map(paths.map((row) => [row.id, row.path]));
  return Promise.all(
    visible.map(async (note): Promise<VoiceNoteView> => {
      const path = pathById.get(note.id);
      return {
        id: note.id,
        targetId: note.targetId,
        authorId: note.authorId,
        status: note.status === 'pending' ? 'uploaded' : note.status,
        transcript: note.transcript,
        durationSeconds: note.durationSeconds,
        createdAt: note.createdAt.toISOString(),
        audioUrl: path ? await deps.storage.signedUrl(path, MEDIA_LINK_TTL_SECONDS) : null,
      };
    }),
  );
}
