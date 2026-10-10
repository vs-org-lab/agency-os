import { and, eq, sql } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';

const { clientStaffAssignments, organizationMemberships } = schema;

/**
 * The client's single active assigned manager, who receives the follow-up tasks of a client
 * decision; null when there is none or several.
 */
export async function soleClientManager(
  tx: DbTransaction,
  clientId: string,
): Promise<string | null> {
  const rows = await tx
    .select({ userId: clientStaffAssignments.userId })
    .from(clientStaffAssignments)
    .innerJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.userId, clientStaffAssignments.userId),
        eq(organizationMemberships.organizationId, clientStaffAssignments.organizationId),
      ),
    )
    .where(
      and(
        eq(clientStaffAssignments.clientId, clientId),
        sql`${clientStaffAssignments.archivedAt} is null`,
        eq(organizationMemberships.role, 'project_manager'),
        eq(organizationMemberships.status, 'active'),
      ),
    );
  return rows.length === 1 ? (rows[0]?.userId ?? null) : null;
}
