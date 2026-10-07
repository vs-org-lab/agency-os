import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createCommercialFixture,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { applicationsSeenAt, markApplicationsSeen, unseenApplicationsCount } from './unseen';

afterAll(async () => {
  await closeTestSql();
});

function claimsFor(userId: string): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: 'aal2',
    session_id: randomUUID(),
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
  };
}

const LATER = new Date(Date.now() + 60 * 60 * 1000);

describe('unseen applications', () => {
  it('counts every visible application before the first visit', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createCommercialFixture(sql, world);
      const { withUserContext } = createDbContexts(testDatabase(sql));
      const viewer = { userId: world.users.founder, organizationId: world.organizationId };

      const result = await withUserContext(claimsFor(world.users.founder), async (tx) => ({
        count: await unseenApplicationsCount(tx, viewer),
        seenAt: await applicationsSeenAt(tx, viewer),
      }));

      expect(result).toEqual({ count: 2, seenAt: null });
    });
  });

  it('counts only applications created after the last visit', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);
      const { withUserContext } = createDbContexts(testDatabase(sql));
      const claims = claimsFor(world.users.founder);
      const viewer = { userId: world.users.founder, organizationId: world.organizationId };

      await withUserContext(claims, (tx) => markApplicationsSeen(tx, { ...viewer, now: LATER }));
      expect(await withUserContext(claims, (tx) => unseenApplicationsCount(tx, viewer))).toBe(0);

      await sql`reset role`;
      await sql`
        update public.applications
        set created_at = ${new Date(LATER.getTime() + 60_000).toISOString()}
        where id = ${fixture.a.applicationId}
      `;

      const result = await withUserContext(claims, async (tx) => ({
        count: await unseenApplicationsCount(tx, viewer),
        seenAt: await applicationsSeenAt(tx, viewer),
      }));
      expect(result).toEqual({ count: 1, seenAt: LATER });
    });
  });

  it('marking twice keeps one marker and moves it forward', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { withUserContext } = createDbContexts(testDatabase(sql));
      const claims = claimsFor(world.users.founder);
      const viewer = { userId: world.users.founder, organizationId: world.organizationId };
      const later = new Date(LATER.getTime() + 60_000);

      await withUserContext(claims, (tx) => markApplicationsSeen(tx, { ...viewer, now: LATER }));
      await withUserContext(claims, (tx) => markApplicationsSeen(tx, { ...viewer, now: later }));

      expect(await withUserContext(claims, (tx) => applicationsSeenAt(tx, viewer))).toEqual(later);
      await sql`reset role`;
      const [row] = await sql<{ count: number }[]>`
        select count(*)::int as count from public.seen_markers where user_id = ${world.users.founder}
      `;
      expect(row?.count).toBe(1);
    });
  });

  it('a manager counts only applications of assigned clients', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createCommercialFixture(sql, world);
      const { withUserContext } = createDbContexts(testDatabase(sql));

      const count = await withUserContext(claimsFor(world.users.manager), (tx) =>
        unseenApplicationsCount(tx, {
          userId: world.users.manager,
          organizationId: world.organizationId,
        }),
      );

      expect(count).toBe(1);
    });
  });
});
