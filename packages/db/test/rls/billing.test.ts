import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asSystem,
  asUser,
  closeTestSql,
  createBillingFixture,
  createFixtureWorld,
  withTestTransaction,
} from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

const BASE_TABLES = ['billing_milestones', 'payment_requests', 'payments', 'legal_invoices'];

async function visibleIds(sql: TransactionSql, relation: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`select id from ${sql('public.' + relation)}`.catch(
    (error: Error) => {
      if (/permission denied/.test(error.message)) return [];
      throw error;
    },
  );
  return rows.map((row) => row.id).sort();
}

async function writeCount(sql: TransactionSql, statement: Promise<{ count: number }>) {
  await sql`savepoint write_probe`;
  const result = await statement.catch((error: Error) => {
    if (/permission denied|row-level security/.test(error.message)) return { count: 0 };
    throw error;
  });
  await sql`rollback to savepoint write_probe`;
  return result.count;
}

describe('billing access', () => {
  it('founder and finance read billing of every client', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const billing = await createBillingFixture(sql, world);

      for (const user of [world.users.founder, world.users.finance]) {
        await asUser(sql, user);
        expect(await visibleIds(sql, 'payment_requests')).toEqual(
          [
            billing.a.sentRequestId,
            billing.a.voidRequestId,
            billing.a.paidRequestId,
            billing.b.sentRequestId,
            billing.b.voidRequestId,
            billing.b.paidRequestId,
          ].sort(),
        );
        expect(await visibleIds(sql, 'payments')).toEqual(
          [billing.a.paymentId, billing.b.paymentId].sort(),
        );
        expect(await visibleIds(sql, 'legal_invoices')).toEqual(
          [billing.a.legalInvoiceId, billing.b.legalInvoiceId].sort(),
        );
        await asSystem(sql);
      }
    });
  });

  it('manager reads billing of any client', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const billing = await createBillingFixture(sql, world);
      await asUser(sql, world.users.manager);

      expect(await visibleIds(sql, 'billing_milestones')).toEqual(
        [...billing.a.milestoneIds, ...billing.b.milestoneIds].sort(),
      );
    });
  });

  it('nobody writes billing rows directly', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const billing = await createBillingFixture(sql, world);

      for (const user of [world.users.founder, world.users.finance]) {
        await asUser(sql, user);
        expect(
          await writeCount(
            sql,
            sql`update public.payment_requests set status = 'paid' where id = ${billing.a.sentRequestId}`,
          ),
        ).toBe(0);
        expect(
          await writeCount(sql, sql`delete from public.payments where id = ${billing.a.paymentId}`),
        ).toBe(0);
        expect(await writeCount(sql, sql`update public.billing_counters set last_number = 1`)).toBe(
          0,
        );
        await asSystem(sql);
      }
    });
  });

  it('freelancer never reads billing', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createBillingFixture(sql, world);
      await asUser(sql, world.users.freelancer);

      for (const table of BASE_TABLES) {
        expect(await visibleIds(sql, table), table).toEqual([]);
      }
    });
  });

  it('decision maker and client finance read own sent and paid requests only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const billing = await createBillingFixture(sql, world);

      await asUser(sql, world.users.decisionMakerA);
      expect(await visibleIds(sql, 'portal_payment_requests')).toEqual(
        [billing.a.sentRequestId, billing.a.paidRequestId].sort(),
      );
      expect(await visibleIds(sql, 'portal_legal_invoices')).toEqual([billing.a.legalInvoiceId]);
      await asSystem(sql);

      await asUser(sql, world.users.clientFinanceB);
      expect(await visibleIds(sql, 'portal_payment_requests')).toEqual(
        [billing.b.sentRequestId, billing.b.paidRequestId].sort(),
      );
      expect(await visibleIds(sql, 'portal_legal_invoices')).toEqual([billing.b.legalInvoiceId]);
      await asSystem(sql);
    });
  });

  it('operational never reads payment requests', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createBillingFixture(sql, world);
      await asUser(sql, world.users.operationalA);

      expect(await visibleIds(sql, 'portal_payment_requests')).toEqual([]);
      expect(await visibleIds(sql, 'portal_legal_invoices')).toEqual([]);
    });
  });

  it('client users never read the base tables', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createBillingFixture(sql, world);

      for (const user of [world.users.decisionMakerA, world.users.clientFinanceB]) {
        await asUser(sql, user);
        for (const table of BASE_TABLES) {
          expect(await visibleIds(sql, table), table).toEqual([]);
        }
        await asSystem(sql);
      }
    });
  });

  it('void requests are hidden from the portal', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const billing = await createBillingFixture(sql, world);
      await asUser(sql, world.users.decisionMakerA);

      expect(await visibleIds(sql, 'portal_payment_requests')).not.toContain(
        billing.a.voidRequestId,
      );
    });
  });
});
