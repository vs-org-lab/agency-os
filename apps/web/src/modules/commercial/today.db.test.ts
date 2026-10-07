import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createCommercialFixture,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
  type World,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { listTodayItems } from './today';

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

const NOW = new Date('2026-10-13T08:00:00Z');

async function arrange(sql: TransactionSql, world: World) {
  const fixture = await createCommercialFixture(sql, world);
  await sql`
    update public.follow_ups set due_on = '2026-10-12' where deal_id = ${fixture.a.dealId}
  `;
  await sql`
    update public.follow_ups set due_on = '2026-10-20' where deal_id = ${fixture.b.dealId}
  `;
  await sql`
    update public.calls set starts_at = '2026-10-13T14:00:00Z', ends_at = '2026-10-13T14:45:00Z'
    where id = ${fixture.b.callId}
  `;
  await sql`
    update public.calls set starts_at = '2026-10-15T14:00:00Z', ends_at = '2026-10-15T14:45:00Z'
    where id = ${fixture.a.callId}
  `;
  await sql`
    update public.applications set path = 'b', created_at = '2026-10-12T07:00:00Z'
    where id = ${fixture.a.applicationId}
  `;
  return fixture;
}

describe('listTodayItems', () => {
  it('includes overdue follow ups first', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await arrange(sql, world);
      const { withUserContext } = createDbContexts(testDatabase(sql));

      const items = await withUserContext(claimsFor(world.users.founder), (tx) =>
        listTodayItems(tx, { now: NOW, timeZone: 'Europe/Lisbon' }),
      );

      expect(items[0]).toMatchObject({
        kind: 'follow_up',
        dealId: fixture.a.dealId,
        overdue: true,
      });
      expect(items.filter((item) => item.kind === 'follow_up')).toHaveLength(1);
    });
  });

  it("includes today's calls in the booking time zone", async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await arrange(sql, world);
      const { withUserContext } = createDbContexts(testDatabase(sql));

      const items = await withUserContext(claimsFor(world.users.founder), (tx) =>
        listTodayItems(tx, { now: NOW, timeZone: 'Europe/Lisbon' }),
      );

      const calls = items.filter((item) => item.kind === 'call');
      expect(calls.map((item) => item.dealId)).toEqual([fixture.b.dealId]);
    });
  });

  it('includes unreviewed queue b applications', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await arrange(sql, world);
      const { withUserContext } = createDbContexts(testDatabase(sql));

      const items = await withUserContext(claimsFor(world.users.founder), (tx) =>
        listTodayItems(tx, { now: NOW, timeZone: 'Europe/Lisbon' }),
      );

      expect(items.find((item) => item.kind === 'queue_b')).toMatchObject({
        id: fixture.a.applicationId,
        overdue: true,
      });
    });
  });

  it('returns nothing for a freelancer', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await arrange(sql, world);
      const { withUserContext } = createDbContexts(testDatabase(sql));

      const items = await withUserContext(claimsFor(world.users.freelancer), (tx) =>
        listTodayItems(tx, { now: NOW, timeZone: 'Europe/Lisbon' }),
      );

      expect(items).toEqual([]);
    });
  });
});
