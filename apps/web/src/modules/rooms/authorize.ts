import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction } from '@agency-os/db';
import { withActor, type Actor } from '@/modules/access';
import type { DbContexts, VerifiedClaims } from '@/platform/db';

const { clients, projects } = schema;

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

/**
 * Who edits the steps and updates of a project: the room writers, and the freelancer assigned to
 * that project ("L E (próprio, sem valores)" in the access matrix). Phases, approvals and the
 * project itself stay with the room writers.
 */
export async function projectEditor(
  contexts: Pick<DbContexts, 'withUserContext'>,
  claims: VerifiedClaims,
  clientId: string,
  projectId: string,
): Promise<Actor | null> {
  const writer = await roomActor(contexts, claims, clientId, 'write');
  if (writer || !z.uuid().safeParse(projectId).success) return writer;
  return withActor(
    contexts,
    claims,
    async (tx, actor) => {
      if (actor.mfaVerifiedAt === null) return null;
      const rows = await tx.execute<{ allowed: boolean }>(sql`
        select app.has_org_role(${actor.organizationId}::uuid, array['freelancer']::app.org_role[])
           and app.can_read_project(${actor.organizationId}::uuid, ${clientId}::uuid,
                                    ${projectId}::uuid) as allowed
      `);
      return rows[0]?.allowed === true ? actor : null;
    },
    null,
  );
}

/**
 * The client's projects the caller may read, resolved under their row level security, so loaders
 * that read in system context apply the same project-level rule (RN-51).
 */
export async function readableProjectIds(
  contexts: Pick<DbContexts, 'withUserContext'>,
  claims: VerifiedClaims,
  clientId: string,
): Promise<string[]> {
  const rows = await contexts.withUserContext(claims, (tx) =>
    tx.select({ id: projects.id }).from(projects).where(eq(projects.clientId, clientId)),
  );
  return rows.map((row) => row.id);
}
