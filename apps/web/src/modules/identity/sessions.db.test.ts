import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { listSessions, revokeSession } from './sessions';

afterAll(async () => {
  await closeTestSql();
});

function claimsFor(userId: string, sessionId: string): VerifiedClaims {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: userId,
    role: 'authenticated',
    aal: 'aal2',
    session_id: sessionId,
    amr: [{ method: 'totp', timestamp: now }],
  };
}

describe('sessions', () => {
  it('lists own sessions with the current one first-class', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const current = randomUUID();
      await sql`
        insert into auth.sessions (id, user_id, created_at, updated_at, aal, user_agent)
        values (${current}, ${world.users.manager}, now(), now(), 'aal2', 'Laptop')
      `;
      const contexts = createDbContexts(testDatabase(sql));

      const sessions = await listSessions(claimsFor(world.users.manager, current), { contexts });

      expect(sessions).toEqual([
        expect.objectContaining({ id: current, userAgent: 'Laptop', isCurrent: true }),
      ]);
      expect(sessions[0]?.lastActiveAt).toBeInstanceOf(Date);
    });
  });

  it('revoking a session audits session.revoked', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const phone = randomUUID();
      await sql`
        insert into auth.sessions (id, user_id, created_at, updated_at, aal)
        values (${phone}, ${world.users.manager}, now(), now(), 'aal2')
      `;
      const contexts = createDbContexts(testDatabase(sql));

      const result = await revokeSession(claimsFor(world.users.manager, randomUUID()), phone, {
        contexts,
      });
      await sql`reset role`;

      expect(result).toEqual({ revoked: true });
      const audits = await sql<{ resource_id: string }[]>`
        select resource_id from public.audit_log
        where action = 'session.revoked' and actor_user_id = ${world.users.manager}
      `;
      expect(audits).toEqual([{ resource_id: phone }]);
    });
  });

  it('revoking an unknown or foreign session reports false and audits nothing', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contexts = createDbContexts(testDatabase(sql));

      const result = await revokeSession(
        claimsFor(world.users.manager, randomUUID()),
        randomUUID(),
        {
          contexts,
        },
      );
      await sql`reset role`;

      expect(result).toEqual({ revoked: false });
      const audits = await sql`select 1 from public.audit_log where action = 'session.revoked'
        and actor_user_id = ${world.users.manager}`;
      expect(audits).toHaveLength(0);
    });
  });
});
