import { daysBetween } from './plan';

export type ReminderKind = 'before' | 'overdue';

export type DueReminder = {
  stage: number;
  kind: ReminderKind;
  daysOverdue: number;
  alertFounder: boolean;
};

/** Days relative to the due date for each reminder stage (RF-045, AUT-19); stage N is index N - 1. */
export const REMINDER_OFFSETS: readonly number[] = [-3, 1, 7, 15, 30];

const FOUNDER_ALERT_FROM_DAYS = 15;

/** The most recent reminder stage reached and not yet sent, or null when nothing is due. */
export function reminderDue(input: {
  dueDate: string;
  today: string;
  lastStage: number;
}): DueReminder | null {
  const offset = daysBetween(input.dueDate, input.today);
  let stage = 0;
  REMINDER_OFFSETS.forEach((threshold, index) => {
    if (offset >= threshold) stage = index + 1;
  });
  if (stage === 0 || stage <= input.lastStage) return null;
  const daysOverdue = Math.max(0, offset);
  return {
    stage,
    kind: stage === 1 ? 'before' : 'overdue',
    daysOverdue,
    alertFounder: stage > 1 && (REMINDER_OFFSETS[stage - 1] ?? 0) >= FOUNDER_ALERT_FROM_DAYS,
  };
}
