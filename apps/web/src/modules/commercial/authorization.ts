import { eq } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import { authorize, loadAccessContext, resolveActor, type Actor } from '@/modules/access';
import type { DbContexts, VerifiedClaims } from '@/platform/db';

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

export function withActor<T>(
  contexts: Pick<DbContexts, 'withUserContext'>,
  claims: VerifiedClaims,
  fn: (tx: DbTransaction, actor: Actor) => Promise<T>,
  onMissingActor: T,
): Promise<T> {
  return contexts.withUserContext(claims, async (tx) => {
    const actor = await resolveActor(tx, claims);
    return actor ? fn(tx, actor) : onMissingActor;
  });
}
