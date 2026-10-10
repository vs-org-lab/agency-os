import { endOfWeek, startOfWeek } from '@/modules/tasks';

export type WeeklyLoad = { tasksThisWeek: number; activeProjects: number };

/** Open tasks due this week (Monday to Sunday) and active projects, beside the weekly hours. */
export function weeklyLoad(input: {
  taskDueDates: Array<string | null>;
  activeProjects: number;
  today: string;
}): WeeklyLoad {
  const from = startOfWeek(input.today);
  const to = endOfWeek(input.today);
  return {
    tasksThisWeek: input.taskDueDates.filter((due) => due !== null && due >= from && due <= to)
      .length,
    activeProjects: input.activeProjects,
  };
}
