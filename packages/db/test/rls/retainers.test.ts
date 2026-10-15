import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asUser,
  closeTestSql,
  createFixtureWorld,
  createRetainerFixture,
  withTestTransaction,
} from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

async function visible(sql: TransactionSql, relation: string, column = 'id'): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    select ${sql(column)}::text as id from ${sql('public.' + relation)}
  `.catch((error: Error) => {
    if (/permission denied/.test(error.message)) return [];
    throw error;
  });
  return rows.map((row) => row.id).sort();
}

describe('retainer access', () => {
  it(
    'room readers read retainers, other clients and outsiders nothing',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);

        for (const user of [
          world.users.founder,
          world.users.finance,
          world.users.manager,
          world.users.freelancer,
        ]) {
          await asUser(sql, user);
          expect(await visible(sql, 'retainers')).toEqual([retainer.retainerId]);
          expect(await visible(sql, 'retainer_limits', 'retainer_id')).toEqual([
            retainer.retainerId,
            retainer.retainerId,
          ]);
          expect(await visible(sql, 'retainer_usage')).toEqual([retainer.usageId]);
          expect(await visible(sql, 'retainer_extra_requests')).toEqual([retainer.extraRequestId]);
        }
        for (const user of [world.users.decisionMakerA, world.users.clientFinanceB]) {
          await asUser(sql, user);
          expect(await visible(sql, 'retainers')).toEqual([]);
          expect(await visible(sql, 'retainer_usage')).toEqual([]);
        }
      });
    },
    SLOW,
  );

  it(
    'the monthly fee is not readable through row access',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRetainerFixture(sql, world);
        await asUser(sql, world.users.founder);
        await expect(
          sql.savepoint((tx) => tx`select monthly_fee from public.retainers`),
        ).rejects.toThrow(/permission denied/);
        const [row] = await sql<{ tier: string }[]>`select tier from public.retainers`;
        expect(row?.tier).toBe('Essencial');
      });
    },
    SLOW,
  );

  it(
    "extra request quotes are readable only by the client's decision maker",
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        await sql`
          update public.retainer_extra_requests
          set status = 'quoted', quote_amount = 150, currency = 'EUR'
          where id = ${retainer.extraRequestId}
        `;

        for (const user of [world.users.founder, world.users.freelancer]) {
          await asUser(sql, user);
          await expect(
            sql.savepoint(
              (tx) => tx`select quote_amount, currency from public.retainer_extra_requests`,
            ),
          ).rejects.toThrow(/permission denied/);
        }

        const quotes = () => sql<{ quote_amount: string | null; currency: string | null }[]>`
          select quote_amount::text, currency::text from public.portal_retainer_extra_requests
        `;
        await asUser(sql, world.users.decisionMakerA);
        expect(await quotes()).toEqual([{ quote_amount: '150.00', currency: 'EUR' }]);
        await asUser(sql, world.users.operationalA);
        expect(await quotes()).toEqual([{ quote_amount: null, currency: null }]);
      });
    },
    SLOW,
  );

  it(
    "portal views show the client's own retainer to its decision maker and operational only",
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);

        for (const user of [world.users.decisionMakerA, world.users.operationalA]) {
          await asUser(sql, user);
          expect(await visible(sql, 'portal_retainers')).toEqual([retainer.retainerId]);
          expect(await visible(sql, 'portal_retainer_limits', 'retainer_id')).toHaveLength(2);
          expect(await visible(sql, 'portal_retainer_usage')).toEqual([retainer.usageId]);
          expect(await visible(sql, 'portal_retainer_extra_requests')).toEqual([
            retainer.extraRequestId,
          ]);
        }
        await asUser(sql, world.users.clientFinanceB);
        expect(await visible(sql, 'portal_retainers')).toEqual([]);
        await asUser(sql, world.users.decisionMakerA);
        const [columns] = await sql<
          Record<string, unknown>[]
        >`select * from public.portal_retainers`;
        expect(Object.keys(columns ?? {})).not.toContain('monthly_fee');
        const [usage] = await sql<Record<string, unknown>[]>`
          select * from public.portal_retainer_usage
        `;
        expect(Object.keys(usage ?? {})).not.toContain('recorded_by');
      });
    },
    SLOW,
  );

  it(
    'months and quantities are checked',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        for (const statement of [
          sql`update public.retainers set starts_on = '2026-10-15' where id = ${retainer.retainerId}`,
          sql`update public.retainer_usage set month = '2026-10-02' where id = ${retainer.usageId}`,
          sql`update public.retainer_usage set quantity = 0 where id = ${retainer.usageId}`,
          sql`update public.retainer_limits set monthly_limit = 0
              where retainer_id = ${retainer.retainerId}`,
          sql`update public.retainers set monthly_fee = -1 where id = ${retainer.retainerId}`,
          sql`update public.retainers set tier = '' where id = ${retainer.retainerId}`,
        ]) {
          await expect(sql.savepoint(() => statement)).rejects.toThrow(/check constraint/);
        }
      });
    },
    SLOW,
  );

  it(
    'authenticated users cannot write retainers',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        await asUser(sql, world.users.founder);
        await expect(
          sql.savepoint(
            (tx) => tx`update public.retainers set tier = 'x' where id = ${retainer.retainerId}`,
          ),
        ).rejects.toThrow(/permission denied/);
        await expect(
          sql.savepoint(
            (tx) => tx`delete from public.retainer_usage where id = ${retainer.usageId}`,
          ),
        ).rejects.toThrow(/permission denied/);
      });
    },
    SLOW,
  );
});
