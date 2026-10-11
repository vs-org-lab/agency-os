import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction, type UpdateVisibility } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import type { VerifiedClaims } from '@/platform/db';
import { projectEditor } from './authorize';
import type { RoomsDeps } from './runtime-types';

const { libraryFiles, libraryFolders, projectUpdateFiles, projectUpdates, projects } = schema;

export const MAX_UPDATE_LENGTH = 5000;

/** Library files one update may attach (spec 2E.1, decision 11). */
export const MAX_UPDATE_ATTACHMENTS = 10;

const updateSchema = z.object({
  projectId: z.uuid(),
  body: z.string().trim().min(1).max(MAX_UPDATE_LENGTH),
  milestone: z.string().trim().max(120).nullable(),
  visibility: z.enum(['internal', 'client']),
  fileIds: z.array(z.uuid()).max(MAX_UPDATE_ATTACHMENTS).default([]),
});

/**
 * Checks the attachments: ready files of the project, and for a client-visible update only files
 * under a root visible to the client.
 */
async function attachmentsRule(
  tx: DbTransaction,
  projectId: string,
  fileIds: string[],
  visibility: UpdateVisibility,
): Promise<'invalid_input' | 'attachment_hidden' | null> {
  if (fileIds.length === 0) return null;
  const rows = await tx
    .select({ id: libraryFiles.id, rootVisibility: libraryFolders.visibility })
    .from(libraryFiles)
    .innerJoin(libraryFolders, eq(libraryFolders.id, libraryFiles.rootId))
    .where(
      and(
        inArray(libraryFiles.id, fileIds),
        eq(libraryFiles.projectId, projectId),
        eq(libraryFiles.status, 'ready'),
      ),
    );
  if (rows.length !== fileIds.length) return 'invalid_input';
  if (visibility === 'client' && rows.some((row) => row.rootVisibility !== 'client')) {
    return 'attachment_hidden';
  }
  return null;
}

/**
 * Posts an update to the project feed. Updates are internal by default (RN-50); a client-visible
 * one notifies the client's decision maker.
 */
export async function publishUpdate(
  claims: VerifiedClaims,
  input: {
    projectId: string;
    body: string;
    milestone: string | null;
    visibility: UpdateVisibility;
    fileIds?: string[];
  },
  deps: RoomsDeps,
): Promise<
  { ok: true } | { ok: false; rule: 'not_found' | 'invalid_input' | 'attachment_hidden' }
> {
  if (!z.uuid().safeParse(input.projectId).success) return { ok: false, rule: 'not_found' };
  const clientId = await deps.contexts.withUserContext(claims, async (tx) => {
    const [project] = await tx
      .select({ clientId: projects.clientId })
      .from(projects)
      .where(eq(projects.id, input.projectId));
    return project?.clientId ?? null;
  });
  const actor = clientId
    ? await projectEditor(deps.contexts, claims, clientId, input.projectId)
    : null;
  if (!actor || !clientId) return { ok: false, rule: 'not_found' };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, rule: 'invalid_input' };
  const data = parsed.data;
  const fileIds = [...new Set(data.fileIds)];

  const refused = await deps.contexts.withSystemContext(async (tx) => {
    const rule = await attachmentsRule(tx, data.projectId, fileIds, data.visibility);
    if (rule) return rule;
    const [update] = await tx
      .insert(projectUpdates)
      .values({
        organizationId: actor.organizationId,
        clientId,
        projectId: data.projectId,
        authorId: actor.userId,
        kind: 'manual',
        body: data.body,
        milestone: data.milestone || null,
        visibility: data.visibility,
      })
      .returning({ id: projectUpdates.id });
    if (!update) throw new Error('Project update was not saved');
    if (fileIds.length > 0) {
      await tx.insert(projectUpdateFiles).values(
        fileIds.map((fileId) => ({
          updateId: update.id,
          fileId,
          organizationId: actor.organizationId,
          clientId,
          projectId: data.projectId,
        })),
      );
    }
    await recordAudit(tx, {
      organizationId: actor.organizationId,
      action: 'project.update_published',
      resourceType: 'project_update',
      resourceId: update.id,
      clientId,
      metadata: { visibility: data.visibility, files: fileIds.length },
    });
    if (data.visibility === 'client') {
      await emit(tx, {
        type: 'rooms.update.published',
        organizationId: actor.organizationId,
        clientId,
        payload: { projectId: data.projectId, updateId: update.id },
      });
    }
    return null;
  });
  if (refused) return { ok: false, rule: refused };
  if (data.visibility === 'client') await (deps.flush ?? requestFlush)();
  return { ok: true };
}
