import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import type { Locale } from '@agency-os/i18n';

const { contracts, proposals } = schema;

export type SignedContractRef = { contractId: string; dealId: string; locale: Locale };

/**
 * The signed contract whose parties a request outside its milestones is issued with: the given
 * deal's contract when it is signed, otherwise the client's most recently signed one. A contract
 * whose accepted proposal has no client details cannot fix the client's side and is skipped.
 */
export async function signedContractFor(
  tx: DbTransaction,
  input: { clientId: string; dealId: string | null },
): Promise<SignedContractRef | null> {
  const signed = and(
    eq(contracts.clientId, input.clientId),
    eq(contracts.status, 'signed'),
    isNotNull(proposals.clientDetails),
  );
  const select = () =>
    tx
      .select({ contractId: contracts.id, dealId: contracts.dealId, locale: contracts.locale })
      .from(contracts)
      .innerJoin(proposals, eq(proposals.id, contracts.proposalId));

  if (input.dealId) {
    const [own] = await select()
      .where(and(signed, eq(contracts.dealId, input.dealId)))
      .orderBy(desc(contracts.signedAt))
      .limit(1);
    if (own) return own;
  }
  const [latest] = await select().where(signed).orderBy(desc(contracts.signedAt)).limit(1);
  return latest ?? null;
}
