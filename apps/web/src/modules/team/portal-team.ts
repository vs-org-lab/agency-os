import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { OrgRole } from '@agency-os/db';
import type { DbContexts, VerifiedClaims } from '@/platform/db';

export type PortalTeamMember = { userId: string; name: string; role: OrgRole; email: string };

/** The agency people on the client's account, as the client reads them (portal_client_team). */
export async function listPortalTeam(
  claims: VerifiedClaims,
  clientId: string,
  deps: { contexts: Pick<DbContexts, 'withUserContext'> },
): Promise<PortalTeamMember[]> {
  if (claims.user_kind !== 'client' || !z.uuid().safeParse(clientId).success) return [];
  const rows = await deps.contexts.withUserContext(claims, (tx) =>
    tx.execute<{ user_id: string; full_name: string; role: OrgRole; email: string }>(sql`
      select user_id, full_name, role, email from public.portal_client_team
      where client_id = ${clientId}::uuid
      order by case role when 'project_manager' then 0 else 1 end, full_name
    `),
  );
  return rows.map((row) => ({
    userId: row.user_id,
    name: row.full_name,
    role: row.role,
    email: row.email,
  }));
}
