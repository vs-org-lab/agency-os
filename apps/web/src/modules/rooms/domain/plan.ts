const DAY_MS = 24 * 60 * 60 * 1000;

function weekOf(projectStart: string, date: string): number {
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${projectStart}T00:00:00Z`)) / DAY_MS;
  return Math.max(0, Math.floor(days / 7));
}

/**
 * Weeks of each phase on the Plan view, counted from the project start. A phase without a start
 * begins where the previous one ends; without a due date it lasts until it starts.
 */
export function planWeeks(
  phases: ReadonlyArray<{ id: string; startedOn: string | null; dueOn: string | null }>,
  projectStart: string,
): Array<{ phaseId: string; startWeek: number; endWeek: number }> {
  let previousEnd = projectStart;
  return phases.map((phase) => {
    const start = phase.startedOn ?? previousEnd;
    const end = phase.dueOn && phase.dueOn > start ? phase.dueOn : start;
    previousEnd = end;
    return {
      phaseId: phase.id,
      startWeek: weekOf(projectStart, start),
      endWeek: weekOf(projectStart, end),
    };
  });
}
