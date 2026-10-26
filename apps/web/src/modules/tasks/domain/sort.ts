export const TASK_SORTS = ['due', 'created', 'title'] as const;

export type TaskSort = (typeof TASK_SORTS)[number];

export function parseTaskSort(value: string | undefined): TaskSort {
  return (TASK_SORTS as readonly string[]).includes(value ?? '') ? (value as TaskSort) : 'due';
}

type Sortable = { title: string; dueOn: string | null; createdAt: string };

const byTitle = (left: Sortable, right: Sortable) =>
  left.title.localeCompare(right.title, 'pt', { sensitivity: 'base' });

const byDue = (left: Sortable, right: Sortable) => {
  if (left.dueOn === right.dueOn) return 0;
  if (left.dueOn === null) return 1;
  if (right.dueOn === null) return -1;
  return left.dueOn < right.dueOn ? -1 : 1;
};

/** Due date ascending with undated last, creation newest first, or title; ties keep creation order. */
export function sortTasks<T extends Sortable>(tasks: readonly T[], sort: TaskSort): T[] {
  const order = {
    due: byDue,
    created: (left: Sortable, right: Sortable) => right.createdAt.localeCompare(left.createdAt),
    title: byTitle,
  }[sort];
  return [...tasks].sort(
    (left, right) => order(left, right) || left.createdAt.localeCompare(right.createdAt),
  );
}
