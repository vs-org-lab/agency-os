import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import { canReadBilling, canWriteBilling, type PaymentRequestView } from '@/modules/billing';
import { paymentRequestViews, signedContractFor } from '@/modules/billing/server';
import type { VerifiedClaims } from '@/platform/db';
import { nowOf, retainerReader, type RetainersDeps } from './access';
import { lisbonDay } from './domain/months';

const { paymentRequests } = schema;

export type RetainerRequestView = PaymentRequestView & { label: string; origin: 'month' | 'extra' };

export type RetainerBillingView = {
  canWrite: boolean;
  /** No signed contract fixes the parties, so the retainer is not billed (spec 3B.2 §2.2). */
  contractMissing: boolean;
  requests: RetainerRequestView[];
};

/**
 * C-10 Billing: the payment requests of the client's retainer, newest first, for staff who read
 * billing; founder and finance act on them. Voided requests are left out, as on the deal.
 */
export async function loadRetainerBilling(
  claims: VerifiedClaims,
  clientId: string,
  deps: RetainersDeps,
): Promise<RetainerBillingView | null> {
  const reader = await retainerReader(claims, clientId, deps);
  if (!reader || !canReadBilling(reader)) return null;
  const today = lisbonDay(nowOf(deps));

  return deps.contexts.withSystemContext(async (tx) => {
    const [retainer] = await tx.execute<{ id: string; deal_id: string | null }>(sql`
      select r.id, p.deal_id
      from public.retainers r join public.projects p on p.id = r.project_id
      where r.client_id = ${clientId}::uuid and r.organization_id = ${reader.organizationId}::uuid
      order by r.status = 'ended', r.created_at desc
      limit 1
    `);
    if (!retainer) return null;
    const contract = await signedContractFor(tx, { clientId, dealId: retainer.deal_id });
    const rows = await tx
      .select()
      .from(paymentRequests)
      .where(and(eq(paymentRequests.retainerId, retainer.id), ne(paymentRequests.status, 'void')))
      .orderBy(desc(paymentRequests.sentAt));
    const views = await paymentRequestViews(tx, rows, today);
    return {
      canWrite: canWriteBilling(reader),
      contractMissing: contract === null,
      requests: rows.map((row, index) => ({
        ...(views[index]?.view as PaymentRequestView),
        label: row.label,
        origin: row.retainerMonth ? ('month' as const) : ('extra' as const),
      })),
    };
  });
}
