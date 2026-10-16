import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asUser,
  closeTestSql,
  createFixtureWorld,
  createRoomFixture,
  withTestTransaction,
  type World,
} from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

async function snapshot(
  sql: TransactionSql,
  world: World,
  clientId: string,
  day: string,
  score: number | null,
  level: string | null,
) {
  await sql`
    insert into public.client_health_snapshots (organization_id, client_id, day, score, level)
    values (${world.organizationId}, ${clientId}, ${day}, ${score},
            ${level}::app.health_level)
  `;
}

async function visible(sql: TransactionSql): Promise<string[]> {
  const rows = await sql<{ client_id: string }[]>`
    select client_id::text from public.client_health_snapshots
  `;
  return rows.map((row) => row.client_id).sort();
}

describe('client health snapshots', () => {
  it(
    'room readers who read billing read snapshots, freelancers and clients nothing',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        await snapshot(sql, world, world.clients.a, '2026-10-15', 80, 'healthy');
        await snapshot(sql, world, world.clients.b, '2026-10-15', 40, 'at_risk');

        await asUser(sql, world.users.founder);
        expect(await visible(sql)).toEqual([world.clients.a, world.clients.b].sort());
        await asUser(sql, world.users.manager);
        expect(await visible(sql)).toEqual([world.clients.a]);
        for (const user of [world.users.freelancer, world.users.decisionMakerA]) {
          await asUser(sql, user);
          expect(await visible(sql)).toEqual([]);
        }
      });
    },
    SLOW,
  );

  it(
    'score and level go together and one snapshot per client and day',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await snapshot(sql, world, world.clients.a, '2026-10-15', null, null);

        await expect(
          sql.savepoint((tx) =>
            snapshot(tx as TransactionSql, world, world.clients.a, '2026-10-16', 80, null),
          ),
        ).rejects.toThrow(/client_health_snapshots_level_with_score/);
        await expect(
          sql.savepoint((tx) =>
            snapshot(tx as TransactionSql, world, world.clients.a, '2026-10-16', 101, 'healthy'),
          ),
        ).rejects.toThrow(/client_health_snapshots_score_range/);
        await expect(
          sql.savepoint((tx) =>
            snapshot(tx as TransactionSql, world, world.clients.a, '2026-10-15', 80, 'healthy'),
          ),
        ).rejects.toThrow(/client_health_snapshots_pkey/);
      });
    },
    SLOW,
  );

  it(
    'authenticated users cannot write snapshots',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await asUser(sql, world.users.founder);

        await expect(
          sql.savepoint((tx) =>
            snapshot(tx as TransactionSql, world, world.clients.a, '2026-10-15', 80, 'healthy'),
          ),
        ).rejects.toThrow(/permission denied/);
      });
    },
    SLOW,
  );
});
