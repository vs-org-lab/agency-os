import { sql } from 'drizzle-orm';
import { resolveActor } from '@/modules/access';
import { recordAudit } from '@/modules/audit';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { setPassword, type SetPasswordDeps, type SetPasswordResult } from './set-password';

export type ActiveSession = {
  id: string;
  createdAt: Date;
  lastActiveAt: Date;
  userAgent: string | null;
  ip: string | null;
  aal: string | null;
  isCurrent: boolean;
};

type SessionRow = {
  id: string;
  created_at: string | Date;
  last_active_at: string | Date;
  user_agent: string | null;
  ip: string | null;
  aal: string | null;
  is_current: boolean;
};

export async function listSessions(
  claims: VerifiedClaims,
  deps: { contexts: Pick<DbContexts, 'withUserContext'> },
): Promise<ActiveSession[]> {
  const rows = await deps.contexts.withUserContext(claims, (tx) =>
    tx.execute<SessionRow>(sql`
      select id, created_at, last_active_at, user_agent, host(ip) as ip, aal, is_current
      from app.list_my_sessions()
    `),
  );

  return rows.map((row) => ({
    id: row.id,
    createdAt: new Date(row.created_at),
    lastActiveAt: new Date(row.last_active_at),
    userAgent: row.user_agent,
    ip: row.ip,
    aal: row.aal,
    isCurrent: row.is_current,
  }));
}

export async function revokeSession(
  claims: VerifiedClaims,
  sessionId: string,
  deps: { contexts: Pick<DbContexts, 'withUserContext'> },
): Promise<{ revoked: boolean }> {
  return deps.contexts.withUserContext(claims, async (tx) => {
    const [row] = await tx.execute<{ revoked: boolean }>(
      sql`select app.revoke_my_session(${sessionId}::uuid) as revoked`,
    );
    if (!row?.revoked) return { revoked: false };

    const actor = await resolveActor(tx, claims);
    if (actor) {
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        action: 'session.revoked',
        resourceType: 'session',
        resourceId: sessionId,
      });
    }
    return { revoked: true };
  });
}

export async function changePassword(
  claims: VerifiedClaims,
  input: { password: string },
  deps: SetPasswordDeps & { signOutEverywhere: () => Promise<void> },
): Promise<SetPasswordResult> {
  const result = await setPassword(claims, input, deps);
  if ('ok' in result) await deps.signOutEverywhere();
  return result;
}
