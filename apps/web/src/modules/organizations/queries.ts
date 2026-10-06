import { and, asc, eq, isNull } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';

const { clients, organizations, profiles } = schema;

export type ClientSummary = { id: string; name: string; logoPath: string | null };

export async function listVisibleClients(tx: DbTransaction): Promise<ClientSummary[]> {
  return tx
    .select({ id: clients.id, name: clients.name, logoPath: clients.logoPath })
    .from(clients)
    .where(isNull(clients.archivedAt))
    .orderBy(asc(clients.name));
}

export async function findVisibleClient(
  tx: DbTransaction,
  clientId: string,
): Promise<ClientSummary | null> {
  const [client] = await tx
    .select({ id: clients.id, name: clients.name, logoPath: clients.logoPath })
    .from(clients)
    .where(and(eq(clients.id, clientId), isNull(clients.archivedAt)));
  return client ?? null;
}

export async function findOrganizationName(
  tx: DbTransaction,
  organizationId: string,
): Promise<string | null> {
  const [organization] = await tx
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  return organization?.name ?? null;
}

export async function findProfileName(tx: DbTransaction, userId: string): Promise<string | null> {
  const [profile] = await tx
    .select({ fullName: profiles.fullName })
    .from(profiles)
    .where(eq(profiles.id, userId));
  return profile?.fullName ?? null;
}
