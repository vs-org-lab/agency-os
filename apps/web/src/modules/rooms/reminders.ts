import { and, eq, isNull, lte } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import { emit, requestFlush } from '@/modules/events';
import type { DbContexts } from '@/platform/db';

const { approvals } = schema;

const DAY_MS = 24 * 60 * 60 * 1000;

/** AUT-15: a pending approval reminds the decision maker after 2 days and alerts the team after 5. */
export const APPROVAL_REMINDER_DAYS = 2;
export const APPROVAL_ALERT_DAYS = 5;

/**
 * Daily sweep over pending approvals; each reminder and each alert is sent once, recorded in
 * `reminded_at` and `alerted_at`.
 */
export async function sweepApprovalReminders(
  now: Date,
  deps: { contexts: Pick<DbContexts, 'withSystemContext'>; flush?: () => Promise<void> },
): Promise<{ reminded: number; alerted: number }> {
  const result = await deps.contexts.withSystemContext(async (tx) => {
    const remindBefore = new Date(now.getTime() - APPROVAL_REMINDER_DAYS * DAY_MS);
    const alertBefore = new Date(now.getTime() - APPROVAL_ALERT_DAYS * DAY_MS);

    const toAlert = await tx
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.status, 'pending'),
          isNull(approvals.alertedAt),
          lte(approvals.requestedAt, alertBefore),
        ),
      )
      .for('update', { skipLocked: true });
    for (const approval of toAlert) {
      await tx
        .update(approvals)
        .set({ alertedAt: now, remindedAt: approval.remindedAt ?? now })
        .where(eq(approvals.id, approval.id));
      await emit(tx, {
        type: 'rooms.approval.overdue',
        organizationId: approval.organizationId,
        clientId: approval.clientId,
        payload: { projectId: approval.projectId, approvalId: approval.id },
      });
    }

    const toRemind = await tx
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.status, 'pending'),
          isNull(approvals.remindedAt),
          lte(approvals.requestedAt, remindBefore),
        ),
      )
      .for('update', { skipLocked: true });
    for (const approval of toRemind) {
      await tx.update(approvals).set({ remindedAt: now }).where(eq(approvals.id, approval.id));
      await emit(tx, {
        type: 'rooms.approval.reminded',
        organizationId: approval.organizationId,
        clientId: approval.clientId,
        payload: { projectId: approval.projectId, approvalId: approval.id },
      });
    }
    return { reminded: toRemind.length, alerted: toAlert.length };
  });

  if (result.reminded + result.alerted > 0) await (deps.flush ?? requestFlush)();
  return result;
}
