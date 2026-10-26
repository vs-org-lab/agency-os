import 'server-only';
import type { TaskStatus } from '@agency-os/db';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
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
  filter: { clientId?: string; assigneeId?: string; status?: TaskStatus },
) {
  return withUserContext(session.claims, (tx) => listTasks(tx, filter));
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
