import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction } from '@agency-os/db';
import { withActor, type Actor } from '@/modules/access';
import { recordAudit } from '@/modules/audit';
import { emit } from '@/modules/events';
import { ensureRootFolder, readableFileIds } from '@/modules/library/server';
import type { VerifiedClaims } from '@/platform/db';
import type { TasksDeps } from './service';

const { libraryFiles, taskComments, taskFiles, taskLinks, tasks } = schema;

export const TASK_UPLOAD_FOLDER = 'Tarefas';

export type CollaborationFailure = {
  ok: false;
  rule: 'forbidden' | 'not_found' | 'invalid_input';
};

export type CollaborationResult<T extends object = Record<never, never>> =
  ({ ok: true } & T) | CollaborationFailure;

const FORBIDDEN: CollaborationFailure = { ok: false, rule: 'forbidden' };
const NOT_FOUND: CollaborationFailure = { ok: false, rule: 'not_found' };
const INVALID: CollaborationFailure = { ok: false, rule: 'invalid_input' };

const uuid = z.uuid();

const commentBody = z.string().trim().min(1).max(5000);

const linkSchema = z.object({
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((value) => {
      if (!value.startsWith('https://')) return false;
      try {
        return new URL(value).hostname !== '';
      } catch {
        return false;
      }
    }),
  title: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .transform((value) => (value ? value : null)),
});

type ReadableTask = {
  id: string;
  organizationId: string;
  clientId: string | null;
  projectId: string | null;
  assigneeId: string | null;
};

type Collaborator = { actor: Actor; task: ReadableTask };

/**
 * Internal members with a verified second factor who read the task under row level security;
 * everyone else, including a guessed task id, is told `forbidden` and nothing is written.
 */
async function collaborator(
  deps: TasksDeps,
  claims: VerifiedClaims,
  taskId: string,
): Promise<Collaborator | null> {
  if (claims.user_kind !== 'internal' || !uuid.safeParse(taskId).success) return null;
  return withActor<Collaborator | null>(
    deps.contexts,
    claims,
    async (tx, actor) => {
      if (actor.mfaVerifiedAt === null) return null;
      const [task] = await tx
        .select({
          id: tasks.id,
          organizationId: tasks.organizationId,
          clientId: tasks.clientId,
          projectId: tasks.projectId,
          assigneeId: tasks.assigneeId,
        })
        .from(tasks)
        .where(eq(tasks.id, taskId));
      return task ? { actor, task } : null;
    },
    null,
  );
}

const isFounder = (actor: Actor) => actor.roles.includes('founder');

export async function addTaskComment(
  claims: VerifiedClaims,
  input: { taskId: string; body: string },
  deps: TasksDeps,
): Promise<CollaborationResult<{ id: string }>> {
  const access = await collaborator(deps, claims, input.taskId);
  if (!access) return FORBIDDEN;
  const body = commentBody.safeParse(input.body);
  if (!body.success) return INVALID;
  const { actor, task } = access;

  return deps.contexts.withSystemContext(async (tx) => {
    const [comment] = await tx
      .insert(taskComments)
      .values({
        organizationId: task.organizationId,
        taskId: task.id,
        authorId: actor.userId,
        body: body.data,
      })
      .returning({ id: taskComments.id });
    if (!comment) throw new Error('Task comment was not created');
    if (task.assigneeId && task.assigneeId !== actor.userId) {
      await emit(tx, {
        type: 'tasks.task.commented',
        organizationId: task.organizationId,
        clientId: task.clientId ?? undefined,
        payload: {
          taskId: task.id,
          commentId: comment.id,
          assigneeId: task.assigneeId,
          authorId: actor.userId,
        },
      });
    }
    return { ok: true as const, id: comment.id };
  });
}

export async function deleteTaskComment(
  claims: VerifiedClaims,
  input: { commentId: string },
  deps: TasksDeps,
): Promise<CollaborationResult> {
  if (!uuid.safeParse(input.commentId).success) return NOT_FOUND;
  const comment = await readRow(deps, claims, (tx) =>
    tx
      .select({
        id: taskComments.id,
        taskId: taskComments.taskId,
        authorId: taskComments.authorId,
        organizationId: taskComments.organizationId,
        clientId: tasks.clientId,
      })
      .from(taskComments)
      .innerJoin(tasks, eq(tasks.id, taskComments.taskId))
      .where(eq(taskComments.id, input.commentId)),
  );
  if (!comment) return NOT_FOUND;
  const access = await collaborator(deps, claims, comment.taskId);
  if (!access) return FORBIDDEN;
  const own = comment.authorId === access.actor.userId;
  if (!own && !isFounder(access.actor)) return FORBIDDEN;

  await deps.contexts.withSystemContext(async (tx) => {
    await tx.delete(taskComments).where(eq(taskComments.id, comment.id));
    if (!own) {
      await recordAudit(tx, {
        organizationId: comment.organizationId,
        action: 'task.comment_deleted',
        resourceType: 'task',
        resourceId: comment.taskId,
        clientId: comment.clientId,
        metadata: {
          commentId: comment.id,
          authorId: comment.authorId,
          actorId: access.actor.userId,
        },
      });
    }
  });
  return { ok: true };
}

/** One row read in the caller's context, so row level security decides what they can see. */
function readRow<T>(
  deps: TasksDeps,
  claims: VerifiedClaims,
  query: (tx: DbTransaction) => Promise<T[]>,
): Promise<T | null> {
  return deps.contexts.withUserContext(claims, async (tx) => (await query(tx))[0] ?? null);
}

export async function addTaskLink(
  claims: VerifiedClaims,
  input: { taskId: string; url: string; title?: string | null },
  deps: TasksDeps,
): Promise<CollaborationResult<{ id: string }>> {
  const access = await collaborator(deps, claims, input.taskId);
  if (!access) return FORBIDDEN;
  const link = linkSchema.safeParse({ url: input.url, title: input.title });
  if (!link.success) return INVALID;
  const { actor, task } = access;

  return deps.contexts.withSystemContext(async (tx) => {
    const [row] = await tx
      .insert(taskLinks)
      .values({
        organizationId: task.organizationId,
        taskId: task.id,
        url: link.data.url,
        title: link.data.title,
        createdBy: actor.userId,
      })
      .returning({ id: taskLinks.id });
    if (!row) throw new Error('Task link was not created');
    await recordAudit(tx, {
      organizationId: task.organizationId,
      action: 'task.link_added',
      resourceType: 'task',
      resourceId: task.id,
      clientId: task.clientId,
      metadata: { linkId: row.id, actorId: actor.userId },
    });
    return { ok: true as const, id: row.id };
  });
}

export async function removeTaskLink(
  claims: VerifiedClaims,
  input: { linkId: string },
  deps: TasksDeps,
): Promise<CollaborationResult> {
  if (!uuid.safeParse(input.linkId).success) return NOT_FOUND;
  const link = await readRow(deps, claims, (tx) =>
    tx
      .select({
        id: taskLinks.id,
        taskId: taskLinks.taskId,
        createdBy: taskLinks.createdBy,
        organizationId: taskLinks.organizationId,
        clientId: tasks.clientId,
      })
      .from(taskLinks)
      .innerJoin(tasks, eq(tasks.id, taskLinks.taskId))
      .where(eq(taskLinks.id, input.linkId)),
  );
  if (!link) return NOT_FOUND;
  const access = await collaborator(deps, claims, link.taskId);
  if (!access) return FORBIDDEN;
  if (link.createdBy !== access.actor.userId && !isFounder(access.actor)) return FORBIDDEN;

  await deps.contexts.withSystemContext(async (tx) => {
    await tx.delete(taskLinks).where(eq(taskLinks.id, link.id));
    await recordAudit(tx, {
      organizationId: link.organizationId,
      action: 'task.link_removed',
      resourceType: 'task',
      resourceId: link.taskId,
      clientId: link.clientId,
      metadata: { linkId: link.id, actorId: access.actor.userId },
    });
  });
  return { ok: true };
}

/** A ready file of the task's own project that the caller reads in the library. */
async function attachableFile(
  deps: TasksDeps,
  claims: VerifiedClaims,
  task: ReadableTask,
  libraryFileId: string,
): Promise<boolean> {
  if (!task.projectId || !uuid.safeParse(libraryFileId).success) return false;
  if (!(await readableFileIds(claims, [libraryFileId], deps)).has(libraryFileId)) return false;
  const [file] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ id: libraryFiles.id })
      .from(libraryFiles)
      .where(
        and(
          eq(libraryFiles.id, libraryFileId),
          eq(libraryFiles.projectId, task.projectId as string),
          eq(libraryFiles.status, 'ready'),
        ),
      ),
  );
  return file !== undefined;
}

export async function attachTaskFile(
  claims: VerifiedClaims,
  input: { taskId: string; libraryFileId: string },
  deps: TasksDeps,
): Promise<CollaborationResult> {
  const access = await collaborator(deps, claims, input.taskId);
  if (!access) return FORBIDDEN;
  const { actor, task } = access;
  if (!(await attachableFile(deps, claims, task, input.libraryFileId))) return INVALID;

  await deps.contexts.withSystemContext(async (tx) => {
    const inserted = await tx
      .insert(taskFiles)
      .values({
        taskId: task.id,
        libraryFileId: input.libraryFileId,
        organizationId: task.organizationId,
        createdBy: actor.userId,
      })
      .onConflictDoNothing()
      .returning({ taskId: taskFiles.taskId });
    if (inserted.length === 0) return;
    await recordAudit(tx, {
      organizationId: task.organizationId,
      action: 'task.file_attached',
      resourceType: 'task',
      resourceId: task.id,
      clientId: task.clientId,
      metadata: { libraryFileId: input.libraryFileId, actorId: actor.userId },
    });
  });
  return { ok: true };
}

export async function detachTaskFile(
  claims: VerifiedClaims,
  input: { taskId: string; libraryFileId: string },
  deps: TasksDeps,
): Promise<CollaborationResult> {
  const access = await collaborator(deps, claims, input.taskId);
  if (!access) return FORBIDDEN;
  const { actor, task } = access;
  if (!uuid.safeParse(input.libraryFileId).success) return NOT_FOUND;
  const link = await readRow(deps, claims, (tx) =>
    tx
      .select({ createdBy: taskFiles.createdBy })
      .from(taskFiles)
      .where(and(eq(taskFiles.taskId, task.id), eq(taskFiles.libraryFileId, input.libraryFileId))),
  );
  if (!link) return NOT_FOUND;
  if (link.createdBy !== actor.userId && !isFounder(actor)) return FORBIDDEN;

  await deps.contexts.withSystemContext(async (tx) => {
    await tx
      .delete(taskFiles)
      .where(and(eq(taskFiles.taskId, task.id), eq(taskFiles.libraryFileId, input.libraryFileId)));
    await recordAudit(tx, {
      organizationId: task.organizationId,
      action: 'task.file_detached',
      resourceType: 'task',
      resourceId: task.id,
      clientId: task.clientId,
      metadata: { libraryFileId: input.libraryFileId, actorId: actor.userId },
    });
  });
  return { ok: true };
}

/** The "Tarefas" folder of the task's project, where files uploaded from a task are kept. */
export async function taskUploadFolder(
  claims: VerifiedClaims,
  input: { taskId: string },
  deps: TasksDeps,
): Promise<CollaborationResult<{ folderId: string }>> {
  const access = await collaborator(deps, claims, input.taskId);
  if (!access) return FORBIDDEN;
  if (!access.task.projectId) return INVALID;
  const folder = await ensureRootFolder(
    claims,
    { projectId: access.task.projectId, name: TASK_UPLOAD_FOLDER },
    deps,
  );
  if (!folder.ok) return folder.rule === 'not_found' ? FORBIDDEN : INVALID;
  return { ok: true, folderId: folder.folderId };
}
