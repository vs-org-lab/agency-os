import 'server-only';
import type { TaskStatus } from '@agency-os/db';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import {
  addTaskComment,
  addTaskLink,
  attachTaskFile,
  deleteTaskComment,
  detachTaskFile,
  removeTaskLink,
  taskUploadFolder,
} from './collaboration';
import { loadTaskDetail } from './detail';
import { listTaskOptions } from './options';
import {
  countTasksByStatus,
  createTask,
  deleteTask,
  listTasks,
  setTaskItem,
  setTaskStatus,
  updateTask,
  type TaskInput,
} from './service';

const deps = () => ({ contexts: { withUserContext, withSystemContext } });

export type TaskSession = { claims: VerifiedClaims };

export function loadTaskOptions(session: TaskSession, clientId: string | null) {
  return listTaskOptions(session.claims, clientId, deps());
}

export function loadTasks(
  session: TaskSession,
  filter: { clientId?: string; assigneeId?: string; status?: TaskStatus | 'all' },
) {
  const { status, ...rest } = filter;
  return withUserContext(session.claims, (tx) =>
    listTasks(tx, { ...rest, status: status === 'all' ? undefined : status }),
  );
}

export function loadTaskCounts(
  session: TaskSession,
  filter: { clientId?: string; assigneeId?: string },
) {
  return withUserContext(session.claims, (tx) => countTasksByStatus(tx, filter));
}

export function createStudioTask(session: TaskSession, input: TaskInput) {
  return createTask(session.claims, input, deps());
}

export function updateStudioTask(
  session: TaskSession,
  input: {
    taskId: string;
    title?: string;
    notes?: string;
    assigneeId?: string | null;
    dueOn?: string | null;
  },
) {
  return updateTask(session.claims, input, deps());
}

export function deleteStudioTask(session: TaskSession, taskId: string) {
  return deleteTask(session.claims, { taskId }, deps());
}

export function setStudioTaskStatus(session: TaskSession, taskId: string, status: TaskStatus) {
  return setTaskStatus(session.claims, { taskId, status }, deps());
}

export function setStudioTaskItem(session: TaskSession, itemId: string, done: boolean) {
  return setTaskItem(session.claims, { itemId, done }, deps());
}

export { TASK_FUNCTIONS } from './automations';

export function loadStudioTaskDetail(session: TaskSession, taskId: string) {
  return loadTaskDetail(session.claims, taskId, deps());
}

export function addStudioTaskComment(session: TaskSession, taskId: string, body: string) {
  return addTaskComment(session.claims, { taskId, body }, deps());
}

export function deleteStudioTaskComment(session: TaskSession, commentId: string) {
  return deleteTaskComment(session.claims, { commentId }, deps());
}

export function addStudioTaskLink(
  session: TaskSession,
  input: { taskId: string; url: string; title?: string | null },
) {
  return addTaskLink(session.claims, input, deps());
}

export function removeStudioTaskLink(session: TaskSession, linkId: string) {
  return removeTaskLink(session.claims, { linkId }, deps());
}

export function attachStudioTaskFile(session: TaskSession, taskId: string, libraryFileId: string) {
  return attachTaskFile(session.claims, { taskId, libraryFileId }, deps());
}

export function detachStudioTaskFile(session: TaskSession, taskId: string, libraryFileId: string) {
  return detachTaskFile(session.claims, { taskId, libraryFileId }, deps());
}

export function loadStudioTaskUploadFolder(session: TaskSession, taskId: string) {
  return taskUploadFolder(session.claims, { taskId }, deps());
}
