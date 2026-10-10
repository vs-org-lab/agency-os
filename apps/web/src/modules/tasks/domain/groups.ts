export type TaskGroup = 'today' | 'this_week' | 'later';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The Sunday that ends the week of `day` (weeks run Monday to Sunday). */
export function endOfWeek(day: string): string {
  const time = Date.parse(`${day}T00:00:00Z`);
  const weekday = new Date(time).getUTCDay();
  return new Date(time + ((7 - weekday) % 7) * DAY_MS).toISOString().slice(0, 10);
}

/** S-03 grouping: overdue and due today, due by Sunday, or later (including undated). */
export function taskGroup(dueOn: string | null, today: string): TaskGroup {
  if (dueOn === null) return 'later';
  if (dueOn <= today) return 'today';
  return dueOn <= endOfWeek(today) ? 'this_week' : 'later';
}
