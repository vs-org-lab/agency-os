import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { VerifiedClaims } from '@/platform/db';
import type { RetainersDeps } from './access';

export type RetainerClient = { retainerId: string; clientId: string; decides: boolean };

/**
 * The client's decision maker or operational user for a retainer they may see in the portal,
 * resolved under their own row level security; `decides` for the decision maker only.
 */
export async function retainerClient(
  claims: VerifiedClaims,
  retainerId: string,
  deps: RetainersDeps,
): Promise<RetainerClient | null> {
  if (claims.user_kind !== 'client' || !z.uuid().safeParse(retainerId).success) return null;
  const [row] = await deps.contexts.withUserContext(claims, (tx) =>
    tx.execute<{ client_id: string; decides: boolean }>(sql`
      select r.client_id,
             app.is_client_member(r.client_id, array['decision_maker']::app.client_role[])
               as decides
      from public.portal_retainers r
      where r.id = ${retainerId}::uuid
    `),
  );
  return row ? { retainerId, clientId: row.client_id, decides: row.decides } : null;
}
