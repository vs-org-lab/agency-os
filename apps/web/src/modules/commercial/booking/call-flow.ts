const HOUR_MS = 60 * 60 * 1000;

export const OUTCOME_CHECK_DELAY_MS = 2 * HOUR_MS;

export const CALL_REMINDERS = [
  { id: 'day-before', offsetMs: 24 * HOUR_MS },
  { id: 'hour-before', offsetMs: HOUR_MS },
] as const;

export const REMINDER_GRACE_MS = 30 * 60 * 1000;

/**
 * Step bodies run once and are memoised, while code between steps re-runs on every replay.
 * Wall-clock decisions therefore live inside steps: a reminder that wakes up long after its
 * moment (a booking made inside the reminder window) is skipped instead of sent late.
 */
export function reminderIsDue(now: Date, scheduledAt: Date, startsAt: Date): boolean {
  return (
    now.getTime() <= scheduledAt.getTime() + REMINDER_GRACE_MS && now.getTime() < startsAt.getTime()
  );
}

export type FlowStep = {
  run<T>(id: string, operation: () => Promise<T>): Promise<T>;
  sleepUntil(id: string, at: Date): Promise<void>;
};

export type CallFlowDeps = {
  now: () => Date;
  ensureCore: (callId: string) => Promise<boolean>;
  syncCall: (callId: string) => Promise<string | null>;
  sendConfirmation: (callId: string) => Promise<boolean>;
  sendReminder: (callId: string, startsAt: Date) => Promise<'sent' | 'skipped'>;
  checkOutcome: (callId: string) => Promise<boolean>;
};

export async function runCallBookedFlow(
  input: { callId: string; startsAt: Date },
  step: FlowStep,
  deps: CallFlowDeps,
): Promise<{ skipped: boolean }> {
  const { callId, startsAt } = input;
  await step.run('ensure-core', () => deps.ensureCore(callId));
  const endsAt = await step.run('sync-calendar-event', () => deps.syncCall(callId));
  if (!endsAt) return { skipped: true };

  await step.run('send-confirmation', () => deps.sendConfirmation(callId));

  for (const reminder of CALL_REMINDERS) {
    const at = new Date(startsAt.getTime() - reminder.offsetMs);
    await step.sleepUntil(`wait-${reminder.id}`, at);
    await step.run(`remind-${reminder.id}`, async () =>
      reminderIsDue(deps.now(), at, startsAt) ? deps.sendReminder(callId, startsAt) : 'skipped',
    );
  }

  await step.sleepUntil(
    'wait-for-outcome',
    new Date(new Date(endsAt).getTime() + OUTCOME_CHECK_DELAY_MS),
  );
  await step.run('check-outcome', () => deps.checkOutcome(callId));
  return { skipped: false };
}
