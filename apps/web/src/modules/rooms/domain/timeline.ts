import type { PhaseStatus } from './phases';

type TimelinePhase = {
  id: string;
  name: string;
  status: PhaseStatus;
  startedAt: string | null;
  completedAt: string | null;
  dueOn: string | null;
  steps: ReadonlyArray<{ dueOn: string | null }>;
};

export type TimelineRow = {
  id: string;
  label: string;
  start: string;
  end: string;
  tone: 'done' | 'active' | 'pending';
};

const TONE: Record<PhaseStatus, TimelineRow['tone']> = {
  done: 'done',
  in_progress: 'active',
  awaiting_approval: 'active',
  pending: 'pending',
};

/**
 * Calendar span of each phase. Phases carry no planned start, so a phase starts when it really
 * started, or where the previous one ends. It ends on completion, its due date or its latest step
 * due date. A phase with none of those dates is returned as undated instead of being drawn.
 */
export function phaseTimeline(
  phases: readonly TimelinePhase[],
  projectStart: string,
): { rows: TimelineRow[]; undated: string[] } {
  const rows: TimelineRow[] = [];
  const undated: string[] = [];
  let previousEnd = projectStart;
  for (const phase of phases) {
    const stepDates = phase.steps.flatMap((step) => (step.dueOn ? [step.dueOn] : []));
    const latestStep = stepDates.length > 0 ? [...stepDates].sort().at(-1)! : null;
    const startedOn = phase.startedAt ? phase.startedAt.slice(0, 10) : null;
    const rawEnd = phase.completedAt?.slice(0, 10) ?? phase.dueOn ?? latestStep;
    if (!rawEnd) {
      undated.push(phase.id);
      continue;
    }
    const start = startedOn ?? previousEnd;
    const end = rawEnd > start ? rawEnd : start;
    previousEnd = end;
    rows.push({ id: phase.id, label: phase.name, start, end, tone: TONE[phase.status] });
  }
  return { rows, undated };
}
