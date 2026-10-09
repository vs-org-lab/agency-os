import { afterAll, describe, expect, it } from 'vitest';
import { closeTestSql, createFixtureWorld, withTestTransaction } from '@agency-os/db/testing';
import { getPortalInvoices } from './portal';
import { createPlanForContract } from './requests';
import { billingClaims, billingDeps, signedContract } from './testing';

afterAll(async () => {
  await closeTestSql();
});

describe('portal invoices', () => {
  it('lists open and paid requests with bank details and the legal invoice', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);

      const invoices = await deps.contexts.withUserContext(
        billingClaims(world.users.decisionMakerA, 'client'),
        (tx) => getPortalInvoices(tx, contract.clientId, '2026-10-18'),
      );

      expect(invoices).toEqual([
        expect.objectContaining({
          id: plan.requestId,
          number: 'PP-2026-0001',
          label: 'Assinatura',
          amount: '6000.00',
          currency: 'EUR',
          status: 'sent',
          overdueDays: 2,
          pdfAvailable: true,
          legalInvoice: null,
          bank: {
            bankName: 'Banco Exemplo',
            iban: 'PT50000201231234567890154',
            bic: 'BEXAPTPL',
            paymentInstructions: '',
          },
        }),
      ]);
    });
  });

  it('operational sees no invoices', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps } = billingDeps(sql);
      await createPlanForContract(contract.contractId, deps);

      expect(
        await deps.contexts.withUserContext(
          billingClaims(world.users.operationalA, 'client'),
          (tx) => getPortalInvoices(tx, contract.clientId, '2026-10-18'),
        ),
      ).toEqual([]);
    });
  });
});
