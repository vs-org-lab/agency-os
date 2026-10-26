import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { VerifiedClaims } from '@/platform/db';
import type { RetainersDeps } from './access';

export type ClientRetainerRequestState = 'received' | 'in_progress' | 'done';

/** A request as the client sees it: its text and where it stands, never the team task behind it. */
export type ClientRetainerRequest = {
  id: string;
  description: string;
  state: ClientRetainerRequestState;
  createdAt: string;
  completedAt: string | null;
};

/** The client's own retainer requests, newest first, through the membership-checked function. */
export async function loadClientRetainerRequests(
  claims: VerifiedClaims,
  clientId: string,
  deps: RetainersDeps,
): Promise<ClientRetainerRequest[]> {
  if (claims.user_kind !== 'client' || !z.uuid().safeParse(clientId).success) return [];
  const rows = await deps.contexts.withUserContext(claims, (tx) =>
    tx.execute<{
      id: string;
      description: string;
      state: ClientRetainerRequestState;
      created_at: string | Date;
      completed_at: string | Date | null;
    }>(sql`select * from app.client_retainer_requests(${clientId}::uuid)`),
  );
  return rows.map((row) => ({
    id: row.id,
    description: row.description,
    state: row.state,
    createdAt: new Date(row.created_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  }));
}
