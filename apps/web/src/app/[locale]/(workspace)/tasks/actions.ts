'use server';

import { revalidatePath } from 'next/cache';
import type { NewTaskInput, TaskChanges } from '@/components/tasks/task-form';
import type { TaskActionResult } from '@/components/tasks/task-errors';
import {
  createStudioTask,
  setStudioTaskItem,
  setStudioTaskStatus,
  updateStudioTask,
} from '@/modules/tasks/server';
import { getVerifiedClaims } from '@/platform/session';

async function run(
  action: (session: {
    claims: NonNullable<Awaited<ReturnType<typeof getVerifiedClaims>>>;
  }) => Promise<{ ok: true } | { ok: false; rule: string }>,
): Promise<TaskActionResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await action({ claims });
  if (!result.ok) return { ok: false, code: result.rule };
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function createTaskAction(input: NewTaskInput) {
  return run(async (session) => {
    const result = await createStudioTask(session, input);
    return result.ok ? { ok: true as const } : result;
  });
}

export async function updateTaskAction(input: TaskChanges) {
  return run((session) => updateStudioTask(session, input));
}

export async function setTaskStatusAction(taskId: string, status: 'open' | 'done') {
  return run((session) => setStudioTaskStatus(session, taskId, status));
}

export async function setTaskItemAction(itemId: string, done: boolean) {
  return run((session) => setStudioTaskItem(session, itemId, done));
}
