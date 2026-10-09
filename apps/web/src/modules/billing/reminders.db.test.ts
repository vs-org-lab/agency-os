import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { closeTestSql, createFixtureWorld, withTestTransaction } from '@agency-os/db/testing';
import { recordPayment } from './payments';
import { sweepPaymentReminders } from './reminders';
import { chasePaymentRequest, createPlanForContract } from './requests';
import { billingClaims, billingDeps, signedContract } from './testing';

afterAll(async () => {
  await closeTestSql();
});

async function events(sql: TransactionSql, organizationId: string) {
  const rows = await sql<{ type: string; payload: { days?: number } }[]>`
    select type, payload from public.domain_events
    where organization_id = ${organizationId} and type like 'billing.request.%'
      and type <> 'billing.request.sent'
    order by created_at, type
  `;
  return rows.map((row) => (row.payload.days ? `${row.type}:${row.payload.days}` : row.type));
}

describe('payment reminders', () => {
  it('sweep sends one reminder per stage', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps } = billingDeps(sql);
      await createPlanForContract(contract.contractId, deps);

      expect(await sweepPaymentReminders('2026-10-12', deps)).toBe(0);
      expect(await sweepPaymentReminders('2026-10-13', deps)).toBe(1);
      expect(await sweepPaymentReminders('2026-10-13', deps)).toBe(0);
      expect(await sweepPaymentReminders('2026-10-17', deps)).toBe(1);

      expect((await events(sql, world.organizationId)).sort()).toEqual([
        'billing.request.overdue',
        'billing.request.reminded',
      ]);
    });
  });

  it('fifteen days overdue alerts the founder once', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps } = billingDeps(sql);
      await createPlanForContract(contract.contractId, deps);

      expect(await sweepPaymentReminders('2026-11-01', deps)).toBe(1);
      expect(await sweepPaymentReminders('2026-11-02', deps)).toBe(0);

      expect((await events(sql, world.organizationId)).sort()).toEqual([
        'billing.request.overdue',
        'billing.request.overdue_alert:16',
      ]);
    });
  });

  it('sweep skips paid and void requests', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);
      await sql`update public.payment_requests set status = 'paid', paid_at = now() where id = ${plan.requestId}`;

      expect(await sweepPaymentReminders('2026-11-30', deps)).toBe(0);
      expect(await events(sql, world.organizationId)).toEqual([]);
    });
  });

  it('sweep skips requests with a payment under review', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);
      await recordPayment(
        billingClaims(world.users.founder),
        {
          requestId: plan.requestId ?? '',
          method: 'bank_transfer',
          amount: '5999.00',
          receivedOn: '2026-10-09',
          reference: 'TRF 1',
        },
        deps,
      );

      expect(await sweepPaymentReminders('2026-11-01', deps)).toBe(0);
      expect(await events(sql, world.organizationId)).toEqual([]);
    });
  });

  it('chasing an overdue request sends the overdue notice', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);

      await chasePaymentRequest(
        billingClaims(world.users.founder),
        { requestId: plan.requestId ?? '' },
        { ...deps, now: () => new Date('2026-10-20T10:00:00Z') },
      );

      expect(await events(sql, world.organizationId)).toEqual(['billing.request.overdue']);
    });
  });
});
