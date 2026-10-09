import { eq } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import type { DbContexts } from '@/platform/db';

const { clients, deals } = schema;

export type DealNotice = { companyName: string; dealUrl: string };

/** The client name and the deal link that billing alerts to the founder mention. */
export async function dealNotice(
  dealId: string,
  deps: { contexts: Pick<DbContexts, 'withSystemContext'>; appBaseUrl: string },
): Promise<DealNotice | null> {
  const [deal] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ companyName: clients.name })
      .from(deals)
      .innerJoin(clients, eq(clients.id, deals.clientId))
      .where(eq(deals.id, dealId)),
  );
  if (!deal) return null;
  return {
    companyName: deal.companyName,
    dealUrl: new URL(`/pipeline/${dealId}`, deps.appBaseUrl).toString(),
  };
}
