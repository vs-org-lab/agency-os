import { sortTasks } from './sort';

export const TASK_STAGES = ['todo', 'doing', 'done'] as const;

export type TaskStage = (typeof TASK_STAGES)[number];

export type DueUrgency = 'overdue' | 'soon' | 'later' | 'none';

type Staged = { status: 'open' | 'done'; startedAt: string | null };

type BoardTask = Staged & {
  title: string;
  dueOn: string | null;
  createdAt: string;
  completedAt: string | null;
};

/** Days, today included, that a done task stays on the board. */
export const DONE_WINDOW_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;
const LISBON_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' });

const addDays = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** An open task is in progress once it has a start time. */
export function taskStage(task: Staged): TaskStage {
  if (task.status === 'done') return 'done';
  return task.startedAt ? 'doing' : 'todo';
}

/** The first Lisbon calendar date whose completed tasks stay on the board. */
export function doneSince(today: string): string {
  return addDays(today, 1 - DONE_WINDOW_DAYS);
}

/** Open columns by due date with undated last; done tasks of the window, most recent first. */
export function boardColumns<T extends BoardTask>(
  tasks: readonly T[],
  today: string,
): Record<TaskStage, T[]> {
  const since = doneSince(today);
  const of = (stage: TaskStage) => tasks.filter((task) => taskStage(task) === stage);
  const done = of('done')
    .filter((task) => task.completedAt && LISBON_DATE.format(new Date(task.completedAt)) >= since)
    .sort((left, right) => (right.completedAt ?? '').localeCompare(left.completedAt ?? ''));
  return { todo: sortTasks(of('todo'), 'due'), doing: sortTasks(of('doing'), 'due'), done };
}

/** Overdue before today, soon for today and tomorrow; a done task carries no urgency. */
export function dueUrgency(dueOn: string | null, today: string, stage: TaskStage): DueUrgency {
  if (!dueOn || stage === 'done') return 'none';
  if (dueOn < today) return 'overdue';
  return dueOn <= addDays(today, 1) ? 'soon' : 'later';
}

/** The stored fields a move to `stage` leaves; the first start time survives later moves. */
export function nextStageFields(
  stage: TaskStage,
  startedAt: Date | null,
  now: Date,
): { status: 'open' | 'done'; startedAt: Date | null; completedAt: Date | null } {
  if (stage === 'todo') return { status: 'open', startedAt: null, completedAt: null };
  if (stage === 'doing') return { status: 'open', startedAt: startedAt ?? now, completedAt: null };
  return { status: 'done', startedAt, completedAt: now };
}
