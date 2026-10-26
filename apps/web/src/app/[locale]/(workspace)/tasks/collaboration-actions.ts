'use server';

import { revalidatePath } from 'next/cache';
import {
  addStudioTaskComment,
  addStudioTaskLink,
  attachStudioTaskFile,
  deleteStudioTaskComment,
  detachStudioTaskFile,
  loadStudioTaskDetail,
  loadStudioTaskUploadFolder,
  removeStudioTaskLink,
  type TaskSession,
} from '@/modules/tasks/server';
import { getVerifiedClaims } from '@/platform/session';

export type CollaborationActionResult<T extends object = Record<never, never>> =
  ({ ok: true } & T) | { ok: false; code: string };

async function run<T extends object>(
  action: (session: TaskSession) => Promise<({ ok: true } & T) | { ok: false; rule: string }>,
  { revalidate = true }: { revalidate?: boolean } = {},
): Promise<CollaborationActionResult<T>> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'forbidden' };
  const result = await action({ claims });
  if (!result.ok) return { ok: false, code: result.rule };
  if (revalidate) revalidatePath('/', 'layout');
  return result;
}

export async function loadTaskDetailAction(taskId: string) {
  const claims = await getVerifiedClaims();
  return claims ? loadStudioTaskDetail({ claims }, taskId) : null;
}

export async function addTaskCommentAction(taskId: string, body: string) {
  return run((session) => addStudioTaskComment(session, taskId, body));
}

export async function deleteTaskCommentAction(commentId: string) {
  return run((session) => deleteStudioTaskComment(session, commentId));
}

export async function addTaskLinkAction(input: {
  taskId: string;
  url: string;
  title?: string | null;
}) {
  return run((session) => addStudioTaskLink(session, input));
}

export async function removeTaskLinkAction(linkId: string) {
  return run((session) => removeStudioTaskLink(session, linkId));
}

export async function attachTaskFileAction(taskId: string, libraryFileId: string) {
  return run((session) => attachStudioTaskFile(session, taskId, libraryFileId));
}

export async function detachTaskFileAction(taskId: string, libraryFileId: string) {
  return run((session) => detachStudioTaskFile(session, taskId, libraryFileId));
}

export async function taskUploadFolderAction(taskId: string) {
  return run((session) => loadStudioTaskUploadFolder(session, taskId), { revalidate: false });
}
