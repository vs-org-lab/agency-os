import { afterAll, describe, expect, it } from 'vitest';
import { closeTestSql, createFixtureWorld, withTestTransaction } from '@agency-os/db/testing';
import { recordPayment } from './payments';
import { createPlanForContract } from './requests';
import { billingClaims, billingDeps, signedContract } from './testing';
import { billingPdfUrl, getDealBilling } from './workspace';

afterAll(async () => {
  await closeTestSql();
});

describe('deal billing', () => {
  it('lists milestones with the open request, payments and overdue days', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);
      const claims = billingClaims(world.users.finance);
      await recordPayment(
        claims,
        {
          requestId: plan.requestId ?? '',
          method: 'bank_transfer',
          amount: '100.00',
          receivedOn: '2026-10-09',
          reference: 'TRF 1',
        },
        deps,
      );

      const billing = await deps.contexts.withUserContext(claims, (tx) =>
        getDealBilling(tx, contract.dealId, '2026-10-20'),
      );

      expect(billing?.milestones.map((milestone) => milestone.status)).toEqual([
        'requested',
        'pending',
      ]);
      expect(billing?.milestones[0]?.request).toMatchObject({
        id: plan.requestId,
        number: 'PP-2026-0001',
        status: 'sent',
        dueDate: '2026-10-16',
        overdueDays: 4,
        pdfAvailable: true,
        legalInvoice: null,
        payments: [{ amount: '100.00', method: 'bank_transfer', status: 'review' }],
      });
      expect(billing?.milestones[1]?.request).toBeNull();
    });
  });

  it('is empty for freelancers and deals without a plan', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps } = billingDeps(sql);

      expect(
        await deps.contexts.withUserContext(billingClaims(world.users.founder), (tx) =>
          getDealBilling(tx, contract.dealId, '2026-10-09'),
        ),
      ).toBeNull();
      await createPlanForContract(contract.contractId, deps);
      expect(
        await deps.contexts.withUserContext(billingClaims(world.users.freelancer), (tx) =>
          getDealBilling(tx, contract.dealId, '2026-10-09'),
        ),
      ).toBeNull();
    });
  });
});

describe('billingPdfUrl', () => {
  it('opens the request pdf for staff and the client, never for other clients', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);
      const input = { kind: 'request' as const, id: plan.requestId ?? '' };

      expect(await billingPdfUrl(billingClaims(world.users.manager), input, deps)).toMatch(
        /^memory:\/\//,
      );
      expect(
        await billingPdfUrl(billingClaims(world.users.decisionMakerA, 'client'), input, deps),
      ).toMatch(/^memory:\/\//);
      expect(
        await billingPdfUrl(billingClaims(world.users.clientFinanceB, 'client'), input, deps),
      ).toBeNull();
      expect(
        await billingPdfUrl(billingClaims(world.users.operationalA, 'client'), input, deps),
      ).toBeNull();
      expect(await billingPdfUrl(billingClaims(world.users.freelancer), input, deps)).toBeNull();
    });
  });
});
