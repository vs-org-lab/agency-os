import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@agency-os/db';
import { withActor } from '@/modules/access';
import { requireRecentMfa } from '@/modules/identity';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { canWriteBilling } from './access';

const { billingMilestones, paymentRequests, payments } = schema;

export type BillingRow =
  | { kind: 'milestone'; id: string }
  | { kind: 'request'; id: string }
  | { kind: 'payment'; id: string };

export const REAUTHENTICATION_REQUIRED = {
  ok: false,
  rule: 'reauthentication_required',
} as const;

/**
 * True when the caller may write billing (founder or finance) and the row belongs to the
 * organisation those roles are held in. Read access alone, held in another organisation through
 * row level security, never grants a write.
 */
export function writesBillingRow(
  contexts: Pick<DbContexts, 'withUserContext'>,
  claims: VerifiedClaims,
  row: BillingRow,
): Promise<boolean> {
  if (!z.uuid().safeParse(row.id).success) return Promise.resolve(false);
  return withActor(
    contexts,
    claims,
    async (tx, actor) => {
      if (!canWriteBilling(actor)) return false;
      const owned = (rows: unknown[]) => rows.length > 0;
      switch (row.kind) {
        case 'milestone':
          return owned(
            await tx
              .select({ id: billingMilestones.id })
              .from(billingMilestones)
              .where(
                and(
                  eq(billingMilestones.id, row.id),
                  eq(billingMilestones.organizationId, actor.organizationId),
                ),
              ),
          );
        case 'request':
          return owned(
            await tx
              .select({ id: paymentRequests.id })
              .from(paymentRequests)
              .where(
                and(
                  eq(paymentRequests.id, row.id),
                  eq(paymentRequests.organizationId, actor.organizationId),
                ),
              ),
          );
        case 'payment':
          return owned(
            await tx
              .select({ id: payments.id })
              .from(payments)
              .where(
                and(eq(payments.id, row.id), eq(payments.organizationId, actor.organizationId)),
              ),
          );
      }
    },
    false,
  );
}

/** Voiding, recording money and registering invoices need a TOTP check in the last 15 minutes (SEC-03). */
export function recentlyVerified(claims: VerifiedClaims): boolean {
  return requireRecentMfa(claims, new Date()).ok;
}
