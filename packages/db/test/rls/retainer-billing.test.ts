import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asUser,
  closeTestSql,
  createFixtureWorld,
  createRetainerBillingFixture,
  withTestTransaction,
  type RetainerBillingFixture,
} from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

type Origin = {
  milestoneId?: string | null;
  retainerId?: string | null;
  month?: string | null;
  extraRequestId?: string | null;
};

let sequence = 0;

async function insertRequest(
  sql: TransactionSql,
  world: { organizationId: string; clients: { a: string } },
  fixture: RetainerBillingFixture,
  origin: Origin,
): Promise<void> {
  sequence += 1;
  await sql`
    insert into public.payment_requests (organization_id, client_id, deal_id, milestone_id,
                                         retainer_id, retainer_month, retainer_extra_request_id,
                                         number, label, amount, currency, locale, due_date,
                                         issuer_details, client_details)
    values (${world.organizationId}, ${world.clients.a}, ${fixture.dealId},
            ${origin.milestoneId ?? null}, ${origin.retainerId ?? null}, ${origin.month ?? null},
            ${origin.extraRequestId ?? null}, ${`PP-2099-${String(sequence).padStart(4, '0')}`},
            'Retainer', 1500, 'EUR', 'pt-PT', current_date + 7, '{}'::jsonb, '{}'::jsonb)
  `;
}

async function milestone(sql: TransactionSql, fixture: RetainerBillingFixture): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into public.billing_milestones (organization_id, client_id, deal_id, contract_id,
                                           position, label, percent, amount, currency, status,
                                           trigger)
    select organization_id, client_id, ${fixture.dealId}, ${fixture.contractId}, 1, 'Assinatura',
           50, 3000, 'EUR', 'pending', 'signature'
    from public.contracts where id = ${fixture.contractId}
    returning id
  `;
  if (!row) throw new Error('Milestone was not created');
  return row.id;
}

const MONTH = '2026-10-01';

describe('retainer payment requests', () => {
  it(
    'a payment request has exactly one origin',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const fixture = await createRetainerBillingFixture(sql, world);
        const retainerId = fixture.retainer.retainerId;
        const milestoneId = await milestone(sql, fixture);

        for (const invalid of [
          { milestoneId, retainerId, month: MONTH },
          {},
          { extraRequestId: fixture.retainer.extraRequestId },
          { retainerId, month: '2026-10-02' },
          { month: MONTH },
        ]) {
          await expect(
            sql.savepoint((tx) => insertRequest(tx, world, fixture, invalid)),
            JSON.stringify(invalid),
          ).rejects.toThrow(/payment_requests_origin/);
        }
        await insertRequest(sql, world, fixture, { milestoneId });
        await insertRequest(sql, world, fixture, { retainerId, month: MONTH });
        await insertRequest(sql, world, fixture, {
          retainerId,
          extraRequestId: fixture.retainer.extraRequestId,
        });
      });
    },
    SLOW,
  );

  it(
    'a retainer month and an extra request are billed at most once',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const fixture = await createRetainerBillingFixture(sql, world);
        const retainerId = fixture.retainer.retainerId;
        const extra = { retainerId, extraRequestId: fixture.retainer.extraRequestId };

        await insertRequest(sql, world, fixture, { retainerId, month: MONTH });
        await expect(
          sql.savepoint((tx) => insertRequest(tx, world, fixture, { retainerId, month: MONTH })),
        ).rejects.toThrow(/payment_requests_retainer_month_key/);
        await insertRequest(sql, world, fixture, extra);
        await expect(
          sql.savepoint((tx) => insertRequest(tx, world, fixture, extra)),
        ).rejects.toThrow(/payment_requests_retainer_extra_key/);
      });
    },
    SLOW,
  );

  it(
    'the portal view does not expose the origin',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const fixture = await createRetainerBillingFixture(sql, world);
        await insertRequest(sql, world, fixture, {
          retainerId: fixture.retainer.retainerId,
          month: MONTH,
        });

        await asUser(sql, world.users.decisionMakerA);
        const [row] = await sql<Record<string, unknown>[]>`
          select * from public.portal_payment_requests
        `;
        expect(row?.label).toBe('Retainer');
        expect(Object.keys(row ?? {})).not.toContain('retainer_id');
        expect(Object.keys(row ?? {})).not.toContain('milestone_id');
      });
    },
    SLOW,
  );
});
