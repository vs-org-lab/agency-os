import { eq } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import type { DbContexts } from '@/platform/db';

const { clients, deals, proposalOptions, proposals } = schema;

export type FounderNotice = { companyName: string; optionName: string; dealUrl: string };

/** The client, the chosen option and the deal link that the founder alerts mention. */
export async function founderNotice(
  input: { dealId: string; proposalId?: string },
  deps: { contexts: Pick<DbContexts, 'withSystemContext'>; appBaseUrl: string },
): Promise<FounderNotice | null> {
  return deps.contexts.withSystemContext(async (tx) => {
    const [deal] = await tx
      .select({ companyName: clients.name })
      .from(deals)
      .innerJoin(clients, eq(clients.id, deals.clientId))
      .where(eq(deals.id, input.dealId));
    if (!deal) return null;
    let optionName = '';
    if (input.proposalId) {
      const [option] = await tx
        .select({ name: proposalOptions.name })
        .from(proposals)
        .innerJoin(proposalOptions, eq(proposalOptions.id, proposals.acceptedOptionId))
        .where(eq(proposals.id, input.proposalId));
      optionName = option?.name ?? '';
    }
    return {
      companyName: deal.companyName,
      optionName,
      dealUrl: new URL(`/pipeline/${input.dealId}`, deps.appBaseUrl).toString(),
    };
  });
}
