import { and, eq, lt, sql } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import { dueDateFrom } from './domain/plan';

const { paymentRequests } = schema;

/** Days past due after which a client's new requests are put on hold (RN-62). */
export const SUSPENSION_OVERDUE_DAYS = 30;

/**
 * RN-62: whether the client has a payment request still open more than 30 days after its due
 * date and no payment for it under review. `today` is the Lisbon calendar date.
 */
export async function clientPaymentsSuspended(
  tx: DbTransaction,
  clientId: string,
  today: string,
): Promise<boolean> {
  const limit = dueDateFrom(new Date(`${today}T12:00:00Z`), -SUSPENSION_OVERDUE_DAYS);
  const [overdue] = await tx
    .select({ id: paymentRequests.id })
    .from(paymentRequests)
    .where(
      and(
        eq(paymentRequests.clientId, clientId),
        eq(paymentRequests.status, 'sent'),
        lt(paymentRequests.dueDate, limit),
        // A payment waiting for finance to settle it means the client has paid (as in reminders).
        sql`not exists (select 1 from public.payments p
                        where p.request_id = ${paymentRequests.id} and p.status = 'review')`,
      ),
    )
    .limit(1);
  return overdue !== undefined;
}
