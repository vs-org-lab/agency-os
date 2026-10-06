import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from './db';
import { isSessionActive } from './session-state';

afterAll(async () => {
  await closeTestSql();
});

function claimsFor(userId: string, sessionId: string): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: 'aal2',
    session_id: sessionId,
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
  };
}

describe('isSessionActive', () => {
  it('is true for an existing session and false once it is revoked or expired', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const live = randomUUID();
      const expired = randomUUID();
      await sql`
        insert into auth.sessions (id, user_id, created_at, updated_at, aal, not_after)
        values (${live}, ${world.users.manager}, now(), now(), 'aal2', null),
               (${expired}, ${world.users.manager}, now(), now(), 'aal2', now() - interval '1 minute')
      `;
      const { withSystemContext } = createDbContexts(testDatabase(sql));

      expect(
        await isSessionActive(claimsFor(world.users.manager, live), { withSystemContext }),
      ).toBe(true);
      expect(
        await isSessionActive(claimsFor(world.users.manager, expired), { withSystemContext }),
      ).toBe(false);
      expect(
        await isSessionActive(claimsFor(world.users.manager, randomUUID()), { withSystemContext }),
      ).toBe(false);
      expect(
        await isSessionActive(claimsFor(world.users.founder, live), { withSystemContext }),
      ).toBe(false);

      await sql`reset role`;
      await sql`delete from auth.sessions where id = ${live}`;
      expect(
        await isSessionActive(claimsFor(world.users.manager, live), { withSystemContext }),
      ).toBe(false);
    });
  });
});
