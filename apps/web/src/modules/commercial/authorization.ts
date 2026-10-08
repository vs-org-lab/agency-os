import { eq } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import { authorize, loadAccessContext, type Actor } from '@/modules/access';

const { deals } = schema;

export async function canWriteClient(
  tx: DbTransaction,
  actor: Actor,
  clientId: string,
): Promise<boolean> {
  const ctx = await loadAccessContext(tx, actor);
  return authorize(actor, 'write', { type: 'pipeline', clientId }, ctx).allowed;
}

export async function writableDeal(
  tx: DbTransaction,
  actor: Actor,
  dealId: string,
): Promise<{ dealId: string; clientId: string; organizationId: string } | null> {
  const [deal] = await tx
    .select({ clientId: deals.clientId, organizationId: deals.organizationId })
    .from(deals)
    .where(eq(deals.id, dealId));
  if (!deal || !(await canWriteClient(tx, actor, deal.clientId))) return null;
  return { dealId, clientId: deal.clientId, organizationId: deal.organizationId };
}

export { withActor } from '@/modules/access';
