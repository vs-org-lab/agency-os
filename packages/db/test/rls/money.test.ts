import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asUser,
  closeTestSql,
  createFixtureWorld,
  createMoneyFixture,
  withTestTransaction,
} from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

async function visible(sql: TransactionSql, relation: string, column = 'id'): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    select ${sql(column)} as id from ${sql('public.' + relation)}
  `.catch((error: Error) => {
    if (/permission denied/.test(error.message)) return [];
    throw error;
  });
  return rows.map((row) => row.id).sort();
}

const sorted = (...ids: string[]) => [...ids].sort();

describe('money access', () => {
  it(
    'finance and founders read money, managers read only, freelancers and clients nothing',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const money = await createMoneyFixture(sql, world);
        const all = sorted(money.a.expenseId, money.b.expenseId, money.internalExpenseId);

        for (const user of [world.users.founder, world.users.finance, world.users.manager]) {
          await asUser(sql, user);
          expect(await visible(sql, 'expenses')).toEqual(all);
          expect(await visible(sql, 'subscriptions')).toEqual([money.subscriptionId]);
        }
        for (const user of [world.users.freelancer, world.users.decisionMakerA]) {
          await asUser(sql, user);
          expect(await visible(sql, 'expenses')).toEqual([]);
          expect(await visible(sql, 'subscriptions')).toEqual([]);
        }
      });
    },
    SLOW,
  );

  it(
    'expenses link to requests of their own client only',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const money = await createMoneyFixture(sql, world);
        await expect(
          sql.savepoint(
            (tx) => tx`
              update public.expenses set payment_request_id = ${money.billing.b.sentRequestId}
              where id = ${money.a.expenseId}
            `,
          ),
        ).rejects.toThrow(/expenses_payment_request_client_fk/);
        await expect(
          sql.savepoint(
            (tx) => tx`
              update public.expenses set payment_request_id = ${money.billing.a.sentRequestId}
              where id = ${money.internalExpenseId}
            `,
          ),
        ).rejects.toThrow(/expenses_request_needs_client/);
      });
    },
    SLOW,
  );

  it(
    'receipt columns are all set or all empty',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const money = await createMoneyFixture(sql, world);
        await expect(
          sql.savepoint(
            (tx) => tx`
              update public.expenses set receipt_name = null where id = ${money.a.expenseId}
            `,
          ),
        ).rejects.toThrow(/expenses_receipt_complete/);
      });
    },
    SLOW,
  );

  it(
    "the portal view shows receipts to the client's decision maker and finance only",
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const money = await createMoneyFixture(sql, world);
        const view = 'portal_payment_request_receipts';

        await asUser(sql, world.users.decisionMakerA);
        expect(await visible(sql, view, 'expense_id')).toEqual([money.a.expenseId]);
        await asUser(sql, world.users.clientFinanceB);
        expect(await visible(sql, view, 'expense_id')).toEqual([money.b.expenseId]);
        for (const user of [world.users.operationalA, world.users.freelancer]) {
          await asUser(sql, user);
          expect(await visible(sql, view, 'expense_id')).toEqual([]);
        }
      });
    },
    SLOW,
  );

  it(
    'authenticated users cannot write money',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const money = await createMoneyFixture(sql, world);
        await asUser(sql, world.users.founder);
        await expect(
          sql.savepoint(
            (tx) => tx`update public.expenses set vendor = 'x' where id = ${money.a.expenseId}`,
          ),
        ).rejects.toThrow(/permission denied/);
        await expect(
          sql.savepoint(
            (tx) => tx`delete from public.subscriptions where id = ${money.subscriptionId}`,
          ),
        ).rejects.toThrow(/permission denied/);
      });
    },
    SLOW,
  );
});
