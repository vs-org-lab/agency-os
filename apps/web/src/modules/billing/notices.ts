import { eq } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import type { DbContexts } from '@/platform/db';

const { clients, deals, paymentRequests } = schema;

export type DealNotice = { companyName: string; dealUrl: string };

/**
 * The client name and the link that billing alerts to the founder mention: the deal, or the
 * retainer room for a retainer request, which the deal's Billing tab does not list.
 */
export async function dealNotice(
  dealId: string,
  deps: { contexts: Pick<DbContexts, 'withSystemContext'>; appBaseUrl: string },
  requestId?: string,
): Promise<DealNotice | null> {
  const found = await deps.contexts.withSystemContext(async (tx) => {
    const [deal] = await tx
      .select({ companyName: clients.name, clientId: deals.clientId })
      .from(deals)
      .innerJoin(clients, eq(clients.id, deals.clientId))
      .where(eq(deals.id, dealId));
    const [request] = requestId
      ? await tx
          .select({ retainerId: paymentRequests.retainerId })
          .from(paymentRequests)
          .where(eq(paymentRequests.id, requestId))
      : [];
    return deal ? { ...deal, retainer: request?.retainerId != null } : null;
  });
  if (!found) return null;
  const path = found.retainer ? `/c/${found.clientId}/retainer` : `/pipeline/${dealId}`;
  return {
    companyName: found.companyName,
    dealUrl: new URL(path, deps.appBaseUrl).toString(),
  };
}
