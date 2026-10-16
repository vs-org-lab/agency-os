import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createBillingFixture,
  createFixtureWorld,
  createRoomFixture,
  withTestTransaction,
  type World,
} from '@agency-os/db/testing';
import { lisbonDay } from './access';
import { loadClientHealth } from './health';
import { sweepHealthSnapshots } from './snapshots';
import { healthClaims, healthDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

/** The sweep covers every active client; within the test, only the world's clients stay active. */
async function onlyWorldClients(sql: TransactionSql, world: World) {
  await sql`
    update public.clients set lifecycle = 'former'
    where id not in (${world.clients.a}, ${world.clients.b}) and lifecycle = 'active'
  `;
}

async function snapshots(sql: TransactionSql, clientId: string) {
  await sql`reset role`;
  return sql<{ day: string; score: number | null; level: string | null }[]>`
    select day::text, score, level::text from public.client_health_snapshots
    where client_id = ${clientId} order by day
  `;
}

async function alerts(sql: TransactionSql, clientId: string): Promise<number> {
  const [row] = await sql<{ total: number }[]>`
    select count(*)::int as total from public.domain_events
    where type = 'health.client.at_risk' and client_id = ${clientId}
  `;
  return row?.total ?? 0;
}

async function snapshot(sql: TransactionSql, world: World, day: string, score: number) {
  const level = score >= 75 ? 'healthy' : score >= 50 ? 'attention' : 'at_risk';
  await sql`
    insert into public.client_health_snapshots (organization_id, client_id, day, score, level)
    values (${world.organizationId}, ${world.clients.a}, ${day}, ${score},
            ${level}::app.health_level)
  `;
}

const shift = (days: number) => {
  const date = new Date(`${lisbonDay(new Date())}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

describe('health snapshots', () => {
  it(
    'one snapshot per client and day, one alert per entry into risk',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const billing = await createBillingFixture(sql, world);
        await onlyWorldClients(sql, world);
        const late = () => sql`
          update public.payment_requests set status = 'sent', paid_at = null, due_date = '2026-10-05'
          where id = ${billing.a.sentRequestId}
        `;
        await late();
        const sweep = (day: string) =>
          sweepHealthSnapshots(new Date(`${day}T10:00:00Z`), healthDeps(sql).deps);

        await sweep('2026-10-15');
        await sweep('2026-10-15');
        expect(await snapshots(sql, world.clients.a)).toMatchObject([
          { day: '2026-10-15', level: 'at_risk' },
        ]);
        expect(await alerts(sql, world.clients.a)).toBe(1);

        await sql`
          update public.payment_requests set status = 'paid', paid_at = '2026-10-04T10:00:00Z'
          where id = ${billing.a.sentRequestId}
        `;
        await sweep('2026-10-16');
        await late();
        await sweep('2026-10-17');

        expect((await snapshots(sql, world.clients.a)).map((row) => row.level)).toEqual([
          'at_risk',
          'healthy',
          'at_risk',
        ]);
        expect(await alerts(sql, world.clients.a)).toBe(2);
      });
    },
    SLOW,
  );

  it(
    'the trend reads the snapshot from 30 days ago or the oldest in the window',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        const { deps } = healthDeps(sql, new Date());
        const trend = async () =>
          (await loadClientHealth(healthClaims(world.users.founder), world.clients.a, deps))?.trend;

        const current = (
          await loadClientHealth(healthClaims(world.users.founder), world.clients.a, deps)
        )?.score;
        expect(current).not.toBeNull();
        expect(await trend()).toBeNull();

        await snapshot(sql, world, shift(-10), 90);
        expect(await trend()).toBe((current ?? 0) - 90);
        await snapshot(sql, world, shift(-30), 70);
        expect(await trend()).toBe((current ?? 0) - 70);
        await snapshot(sql, world, shift(-45), 10);
        expect(await trend()).toBe((current ?? 0) - 70);
      });
    },
    SLOW,
  );
});
