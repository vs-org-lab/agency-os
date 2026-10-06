import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import type { VerifiedClaims } from '@/platform/db';
import type { AccessContext, Actor, ClientRole, InternalRole } from './types';

const { clientMemberships, clientStaffAssignments, organizationMemberships, profiles } = schema;

function mfaVerifiedAt(claims: VerifiedClaims): Date | null {
  if (claims.aal !== 'aal2') return null;
  const totp = claims.amr
    .filter((entry) => entry.method === 'totp')
    .map((entry) => entry.timestamp)
    .sort((a, b) => b - a)[0];
  return totp === undefined ? null : new Date(totp * 1000);
}

export async function resolveActor(
  tx: DbTransaction,
  claims: VerifiedClaims,
): Promise<Actor | null> {
  const [profile] = await tx
    .select({ archivedAt: profiles.archivedAt })
    .from(profiles)
    .where(eq(profiles.id, claims.sub));
  if (!profile || profile.archivedAt !== null) return null;

  const internal = await tx
    .select({
      organizationId: organizationMemberships.organizationId,
      role: organizationMemberships.role,
    })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.userId, claims.sub),
        eq(organizationMemberships.status, 'active'),
        isNull(organizationMemberships.archivedAt),
        sql`app.is_active_organization(${organizationMemberships.organizationId})`,
      ),
    )
    .orderBy(asc(organizationMemberships.createdAt));

  const primaryInternal = internal[0];
  if (primaryInternal) {
    return {
      userId: claims.sub,
      organizationId: primaryInternal.organizationId,
      roles: internal
        .filter((row) => row.organizationId === primaryInternal.organizationId)
        .map((row) => row.role as InternalRole),
      mfaVerifiedAt: mfaVerifiedAt(claims),
    };
  }

  const [client] = await tx
    .select({ organizationId: clientMemberships.organizationId })
    .from(clientMemberships)
    .where(
      and(
        eq(clientMemberships.userId, claims.sub),
        eq(clientMemberships.status, 'active'),
        isNull(clientMemberships.archivedAt),
        sql`app.is_active_client(${clientMemberships.clientId})`,
      ),
    )
    .orderBy(asc(clientMemberships.createdAt))
    .limit(1);
  if (!client) return null;

  return {
    userId: claims.sub,
    organizationId: client.organizationId,
    roles: [],
    mfaVerifiedAt: mfaVerifiedAt(claims),
  };
}

export async function loadAccessContext(tx: DbTransaction, actor: Actor): Promise<AccessContext> {
  const assignments = await tx
    .select({ clientId: clientStaffAssignments.clientId })
    .from(clientStaffAssignments)
    .where(
      and(
        eq(clientStaffAssignments.userId, actor.userId),
        eq(clientStaffAssignments.organizationId, actor.organizationId),
        isNull(clientStaffAssignments.archivedAt),
        sql`app.is_active_client(${clientStaffAssignments.clientId})`,
      ),
    );

  const memberships = await tx
    .select({ clientId: clientMemberships.clientId, role: clientMemberships.role })
    .from(clientMemberships)
    .where(
      and(
        eq(clientMemberships.userId, actor.userId),
        eq(clientMemberships.organizationId, actor.organizationId),
        eq(clientMemberships.status, 'active'),
        isNull(clientMemberships.archivedAt),
        sql`app.is_active_client(${clientMemberships.clientId})`,
      ),
    );

  const clientRoles = new Map<string, ClientRole[]>();
  for (const membership of memberships) {
    const roles = clientRoles.get(membership.clientId) ?? [];
    roles.push(membership.role as ClientRole);
    clientRoles.set(membership.clientId, roles);
  }

  return {
    assignedClientIds: new Set(assignments.map((assignment) => assignment.clientId)),
    clientRoles,
  };
}
