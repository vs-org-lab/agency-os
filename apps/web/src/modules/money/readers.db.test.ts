import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createMoneyFixture,
  withTestTransaction,
  type World,
} from '@agency-os/db/testing';
import { expenseReceiptUrl, loadMoneyYear, receiptUrlFor } from './readers';
import { moneyClaims, moneyDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

async function addExpense(
  sql: TransactionSql,
  world: World,
  spentOn: string,
  amount: number,
  currency: string,
) {
  await sql`reset role`;
  await sql`
    insert into public.expenses (organization_id, spent_on, vendor, category, amount, currency)
    values (${world.organizationId}, ${spentOn}, 'Fornecedor', 'other', ${amount},
            ${currency}::app.currency)
  `;
}

async function addSubscription(
  sql: TransactionSql,
  world: World,
  name: string,
  nextRenewalOn: string,
  status: 'active' | 'cancelled' = 'active',
) {
  await sql`reset role`;
  await sql`
    insert into public.subscriptions (organization_id, name, category, amount, currency, cycle,
                                      next_renewal_on, status)
    values (${world.organizationId}, ${name}, 'software', 10, 'EUR', 'monthly', ${nextRenewalOn},
            ${status}::app.subscription_status)
  `;
}

describe('money year', () => {
  it(
    'the year adds what came in, what is open and what went out per currency',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createMoneyFixture(sql, world);
        await addExpense(sql, world, '2026-03-01', 50, 'USD');
        await addExpense(sql, world, '2025-12-31', 99, 'USD');
        const { deps } = moneyDeps(sql);

        const year = await loadMoneyYear(moneyClaims(world.users.finance), 2026, deps);
        expect(year?.summary).toEqual({
          received: { EUR: '6000.00' },
          open: { EUR: '6000.00' },
          spent: { EUR: '360.00', USD: '50.00' },
        });
        expect(year?.years).toEqual([2025, 2026]);
        expect(year?.canWrite).toBe(true);
        expect(year?.requests.map((request) => request.status).sort()).toEqual([
          'paid',
          'paid',
          'sent',
          'sent',
          'void',
          'void',
        ]);
        expect(year?.expenses).toHaveLength(4);
        const linked = year?.expenses.find((expense) => expense.paymentRequestNumber !== null);
        expect(linked).toMatchObject({ hasReceipt: true, clientName: expect.any(String) });
        expect(year?.clients.length).toBeGreaterThan(0);

        const before = await loadMoneyYear(moneyClaims(world.users.finance), 2025, deps);
        expect(before?.summary.spent).toEqual({ USD: '99.00' });
        expect(before?.summary.received).toEqual({});
      });
    },
    SLOW,
  );

  it(
    'subscriptions come by renewal with their state',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createMoneyFixture(sql, world);
        await addSubscription(sql, world, 'Atrasada', '2026-10-10');
        await addSubscription(sql, world, 'Em breve', '2026-10-18');
        await addSubscription(sql, world, 'Cancelada', '2026-10-01', 'cancelled');
        const { deps } = moneyDeps(sql);

        const year = await loadMoneyYear(moneyClaims(world.users.founder), 2026, deps);
        expect(year?.subscriptions.map((item) => [item.name, item.renewal])).toEqual([
          ['Atrasada', 'overdue'],
          ['Em breve', 'soon'],
          ['Figma', 'later'],
          ['Cancelada', null],
        ]);
      });
    },
    SLOW,
  );

  it(
    'only billing readers see the year',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const money = await createMoneyFixture(sql, world);
        const { deps } = moneyDeps(sql);

        const manager = await loadMoneyYear(moneyClaims(world.users.manager), 2026, deps);
        expect(manager?.canWrite).toBe(false);
        expect(
          await expenseReceiptUrl(moneyClaims(world.users.manager), money.a.expenseId, deps),
        ).toContain('ttl=900');
        for (const [userId, kind] of [
          [world.users.freelancer, 'internal'],
          [world.users.decisionMakerA, 'client'],
        ] as const) {
          expect(await loadMoneyYear(moneyClaims(userId, kind), 2026, deps)).toBeNull();
          expect(
            await expenseReceiptUrl(moneyClaims(userId, kind), money.a.expenseId, deps),
          ).toBeNull();
        }
        expect(
          await expenseReceiptUrl(moneyClaims(world.users.finance), money.internalExpenseId, deps),
        ).toBeNull();
      });
    },
    SLOW,
  );

  it(
    'the receipt route redirects readers and refuses others',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const money = await createMoneyFixture(sql, world);
        const { deps } = moneyDeps(sql);
        const url = (userId: string, kind: 'internal' | 'client', expenseId: string) =>
          receiptUrlFor(moneyClaims(userId, kind), expenseId, deps);

        expect(await url(world.users.finance, 'internal', money.a.expenseId)).toContain('ttl=900');
        expect(await url(world.users.decisionMakerA, 'client', money.a.expenseId)).toContain(
          'ttl=900',
        );
        expect(await url(world.users.clientFinanceB, 'client', money.b.expenseId)).toContain(
          'ttl=900',
        );
        expect(await url(world.users.decisionMakerA, 'client', money.b.expenseId)).toBeNull();
        expect(await url(world.users.operationalA, 'client', money.a.expenseId)).toBeNull();
        expect(await url(world.users.freelancer, 'internal', money.a.expenseId)).toBeNull();
        expect(await url(world.users.finance, 'internal', 'not-a-uuid')).toBeNull();
      });
    },
    SLOW,
  );
});
