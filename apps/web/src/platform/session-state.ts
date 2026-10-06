import { sql } from 'drizzle-orm';
import type { DbContexts, VerifiedClaims } from './db';

export async function isSessionActive(
  claims: Pick<VerifiedClaims, 'sub' | 'session_id'>,
  contexts: Pick<DbContexts, 'withSystemContext'>,
): Promise<boolean> {
  const [row] = await contexts.withSystemContext((tx) =>
    tx.execute<{ active: boolean }>(sql`
      select exists (
        select 1 from auth.sessions s
        where s.id = ${claims.session_id}::uuid
          and s.user_id = ${claims.sub}::uuid
          and (s.not_after is null or s.not_after > now())
      ) as active
    `),
  );
  return row?.active === true;
}
