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

async function milestone(sql: TransactionSql, world: World, clientId: string, year: number) {
  const [row] = await sql<{ id: string }[]>`
    insert into public.client_milestones (organization_id, client_id, kind, year)
    values (${world.organizationId}, ${clientId}, 'renewal_anniversary', ${year})
    returning id
  `;
  if (!row) throw new Error('Milestone was not created');
  return row.id;
}

async function visible(sql: TransactionSql): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`select id::text from public.client_milestones`;
  return rows.map((row) => row.id).sort();
}

describe('client milestones', () => {
  it(
    'room readers read milestones, other clients nothing',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        const a = await milestone(sql, world, world.clients.a, 1);
        const b = await milestone(sql, world, world.clients.b, 1);

        await asUser(sql, world.users.founder);
        expect(await visible(sql)).toEqual([a, b].sort());
        await asUser(sql, world.users.freelancer);
        expect(await visible(sql)).toEqual([a]);
        await asUser(sql, world.users.decisionMakerA);
        expect(await visible(sql)).toEqual([]);
      });
    },
    SLOW,
  );

  it(
    'one milestone per client, kind and year',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await milestone(sql, world, world.clients.a, 1);
        await milestone(sql, world, world.clients.a, 2);

        await expect(
          sql.savepoint((tx) => milestone(tx as TransactionSql, world, world.clients.a, 1)),
        ).rejects.toThrow(/client_milestones_client_kind_year_key/);
        await expect(
          sql.savepoint((tx) => milestone(tx as TransactionSql, world, world.clients.a, 0)),
        ).rejects.toThrow(/client_milestones_year_positive/);
      });
    },
    SLOW,
  );

  it(
    'authenticated users cannot write milestones',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await asUser(sql, world.users.founder);

        await expect(
          sql.savepoint((tx) => milestone(tx as TransactionSql, world, world.clients.a, 1)),
        ).rejects.toThrow(/permission denied/);
      });
    },
    SLOW,
  );
});
