import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@agency-os/db';
import { withActor } from '@/modules/access';
import type { VerifiedClaims } from '@/platform/db';
import { listTasks, type TaskView, type TasksDeps } from './service';

const { libraryFiles, profiles, taskComments, taskFiles, taskLinks } = schema;

export type TaskDetail = TaskView & {
  comments: {
    id: string;
    authorId: string | null;
    authorName: string | null;
    body: string;
    createdAt: string;
    canDelete: boolean;
  }[];
  files: { id: string; name: string; mimeType: string | null; canDetach: boolean }[];
  links: { id: string; url: string; title: string | null; canRemove: boolean }[];
};

/**
 * The task with its comments, files and links as the caller may read them (row level security),
 * or null when they do not read it. The flags say what they may remove: their own contributions,
 * and anything for a founder.
 */
export async function loadTaskDetail(
  claims: VerifiedClaims,
  taskId: string,
  deps: Pick<TasksDeps, 'contexts'>,
): Promise<TaskDetail | null> {
  if (!z.uuid().safeParse(taskId).success) return null;
  return withActor<TaskDetail | null>(
    deps.contexts,
    claims,
    async (tx, actor) => {
      const [task] = await listTasks(tx, { taskId });
      if (!task) return null;
      const founder = actor.roles.includes('founder');
      const [comments, files, links] = await Promise.all([
        tx
          .select({
            id: taskComments.id,
            authorId: taskComments.authorId,
            authorName: profiles.fullName,
            body: taskComments.body,
            createdAt: taskComments.createdAt,
          })
          .from(taskComments)
          .leftJoin(profiles, eq(profiles.id, taskComments.authorId))
          .where(eq(taskComments.taskId, taskId))
          .orderBy(asc(taskComments.createdAt), asc(taskComments.id)),
        tx
          .select({
            id: libraryFiles.id,
            name: libraryFiles.name,
            mimeType: libraryFiles.mimeType,
            createdBy: taskFiles.createdBy,
          })
          .from(taskFiles)
          .innerJoin(libraryFiles, eq(libraryFiles.id, taskFiles.libraryFileId))
          .where(eq(taskFiles.taskId, taskId))
          .orderBy(asc(taskFiles.createdAt), asc(libraryFiles.id)),
        tx
          .select({
            id: taskLinks.id,
            url: taskLinks.url,
            title: taskLinks.title,
            createdBy: taskLinks.createdBy,
          })
          .from(taskLinks)
          .where(eq(taskLinks.taskId, taskId))
          .orderBy(asc(taskLinks.createdAt), asc(taskLinks.id)),
      ]);
      return {
        ...task,
        comments: comments.map((comment) => ({
          id: comment.id,
          authorId: comment.authorId,
          authorName: comment.authorName,
          body: comment.body,
          createdAt: comment.createdAt.toISOString(),
          canDelete: founder || comment.authorId === actor.userId,
        })),
        files: files.map((file) => ({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          canDetach: founder || file.createdBy === actor.userId,
        })),
        links: links.map((link) => ({
          id: link.id,
          url: link.url,
          title: link.title,
          canRemove: founder || link.createdBy === actor.userId,
        })),
      };
    },
    null,
  );
}
