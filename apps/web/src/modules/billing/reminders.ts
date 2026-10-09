import { and, asc, eq, lt, lte, sql } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import { emit, requestFlush } from '@/modules/events';
import type { DbContexts } from '@/platform/db';
import { REMINDER_OFFSETS, reminderDue } from './domain/reminders';

const { paymentRequests } = schema;

const LAST_STAGE = REMINDER_OFFSETS.length;
const FIRST_OFFSET_DAYS = Math.abs(REMINDER_OFFSETS[0] ?? 0);

/**
 * Daily reminder sweep (RF-045, AUT-19, RN-34): for each open request, sends only the latest
 * reminder stage reached and not yet sent, and alerts the founder at 15 and 30 days overdue.
 * Returns the number of requests reminded.
 */
export async function sweepPaymentReminders(
  today: string,
  deps: { contexts: Pick<DbContexts, 'withSystemContext'>; flush?: () => Promise<void> },
): Promise<number> {
  const reminded = await deps.contexts.withSystemContext(async (tx) => {
    const candidates = await tx
      .select()
      .from(paymentRequests)
      .where(
        and(
          eq(paymentRequests.status, 'sent'),
          lt(paymentRequests.lastReminderStage, LAST_STAGE),
          lte(paymentRequests.dueDate, sql`${today}::date + ${FIRST_OFFSET_DAYS}::int`),
        ),
      )
      .orderBy(asc(paymentRequests.dueDate))
      .for('update', { skipLocked: true });

    let count = 0;
    for (const request of candidates) {
      const due = reminderDue({
        dueDate: request.dueDate,
        today,
        lastStage: request.lastReminderStage,
      });
      if (!due) continue;
      await tx
        .update(paymentRequests)
        .set({ lastReminderStage: due.stage })
        .where(eq(paymentRequests.id, request.id));
      const base = {
        organizationId: request.organizationId,
        clientId: request.clientId,
      };
      const payload = { dealId: request.dealId, requestId: request.id };
      await emit(tx, {
        ...base,
        type: due.kind === 'before' ? 'billing.request.reminded' : 'billing.request.overdue',
        payload,
      });
      if (due.alertFounder) {
        await emit(tx, {
          ...base,
          type: 'billing.request.overdue_alert',
          payload: { ...payload, days: due.daysOverdue },
        });
      }
      count += 1;
    }
    return count;
  });

  if (reminded > 0) await (deps.flush ?? requestFlush)();
  return reminded;
}
