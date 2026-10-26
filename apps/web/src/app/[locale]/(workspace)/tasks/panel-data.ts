import { loadAttachableFiles } from '@/modules/library/server';
import { loadStudioTaskDetail, type TaskSession } from '@/modules/tasks/server';

/**
 * The task named by `?task=` and the library files of its project that can be linked. A task the
 * reader cannot read, or that belongs to another client than the room, opens nothing.
 */
export async function loadPanelData(
  session: TaskSession,
  taskId: string | undefined,
  clientId: string | null,
) {
  const found = taskId ? await loadStudioTaskDetail(session, taskId) : null;
  const detail = found && (clientId === null || found.clientId === clientId) ? found : null;
  const attachable = detail?.projectId
    ? await loadAttachableFiles(session.claims, detail.projectId)
    : [];
  return { detail, attachable };
}
