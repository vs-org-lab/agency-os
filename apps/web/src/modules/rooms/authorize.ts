import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction } from '@agency-os/db';
import { withActor, type Actor } from '@/modules/access';
import type { DbContexts, VerifiedClaims } from '@/platform/db';

const { clients } = schema;

export type RoomAccess = 'write' | 'read';

async function grants(
  tx: DbTransaction,
  actor: Actor,
  clientId: string,
  access: RoomAccess,
): Promise<boolean> {
  if (actor.mfaVerifiedAt === null) return false;
  const [client] = await tx
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.organizationId, actor.organizationId)));
  if (!client) return false;
  const check =
    access === 'write'
      ? sql`app.can_write_rooms(${actor.organizationId}::uuid, ${clientId}::uuid)`
      : sql`app.can_read_rooms(${actor.organizationId}::uuid, ${clientId}::uuid)`;
  const rows = await tx.execute<{ allowed: boolean }>(sql`select ${check} as allowed`);
  return rows[0]?.allowed === true;
}

/**
 * Resolves the staff actor when they may read or write the client's room in the organisation
 * where they hold their roles; null otherwise.
 */
export function roomActor(
  contexts: Pick<DbContexts, 'withUserContext'>,
  claims: VerifiedClaims,
  clientId: string,
  access: RoomAccess,
): Promise<Actor | null> {
  if (!z.uuid().safeParse(clientId).success) return Promise.resolve(null);
  return withActor(
    contexts,
    claims,
    async (tx, actor) => ((await grants(tx, actor, clientId, access)) ? actor : null),
    null,
  );
}
