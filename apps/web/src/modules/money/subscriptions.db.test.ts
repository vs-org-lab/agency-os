import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createMoneyFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { cancelSubscription, renewSubscription, saveSubscription } from './subscriptions';
import { moneyClaims, moneyDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

async function subscriptionRow(sql: TransactionSql, id: string) {
  await sql`reset role`;
  const [row] = await sql<{ next_renewal_on: string; status: string }[]>`
    select next_renewal_on::text, status::text from public.subscriptions where id = ${id}
  `;
  return row;
}

describe('money subscriptions', () => {
  it(
    'renewing creates the expense and moves the date',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const { deps } = moneyDeps(sql);
        const finance = moneyClaims(world.users.finance);

        const saved = await saveSubscription(
          finance,
          {
            name: 'Adobe',
            vendor: 'Adobe Inc',
            category: 'software',
            amount: '59.99',
            currency: 'EUR',
            cycle: 'monthly',
            nextRenewalOn: '2027-01-31',
          },
          deps,
        );
        if (!saved.ok) throw new Error('subscription not saved');

        const renewed = await renewSubscription(finance, { id: saved.id }, deps);
        if (!renewed.ok) throw new Error('not renewed');
        await sql`reset role`;
        const [expense] = await sql<
          {
            spent_on: string;
            vendor: string;
            amount: string;
            category: string;
            subscription_id: string;
          }[]
        >`
          select spent_on::text, vendor, amount::text, category::text, subscription_id
          from public.expenses where id = ${renewed.expenseId}
        `;
        expect(expense).toEqual({
          spent_on: '2027-01-31',
          vendor: 'Adobe Inc',
          amount: '59.99',
          category: 'software',
          subscription_id: saved.id,
        });
        expect(await subscriptionRow(sql, saved.id)).toEqual({
          next_renewal_on: '2027-02-28',
          status: 'active',
        });
      });
    },
    SLOW,
  );

  it(
    'cancelled subscriptions do not renew',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const money = await createMoneyFixture(sql, world);
        const { deps } = moneyDeps(sql);
        const founder = moneyClaims(world.users.founder);

        expect(
          await renewSubscription(
            moneyClaims(world.users.manager),
            { id: money.subscriptionId },
            deps,
          ),
        ).toEqual({ ok: false, rule: 'not_found' });
        expect(await cancelSubscription(founder, money.subscriptionId, deps)).toEqual({ ok: true });
        expect(await subscriptionRow(sql, money.subscriptionId)).toMatchObject({
          status: 'cancelled',
        });
        expect(await renewSubscription(founder, { id: money.subscriptionId }, deps)).toEqual({
          ok: false,
          rule: 'invalid_state',
        });
      });
    },
    SLOW,
  );
});
