import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createMoneyFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
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

  it("receipts are shown only to the client's decision maker and finance", async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const money = await createMoneyFixture(sql, world);
      const { deps } = billingDeps(sql);
      const read = (userId: string, clientId: string) =>
        deps.contexts.withUserContext(billingClaims(userId, 'client'), (tx) =>
          getPortalInvoices(tx, clientId, '2026-10-18'),
        );

      const own = await read(world.users.decisionMakerA, world.clients.a);
      expect(own.find((invoice) => invoice.id === money.billing.a.sentRequestId)?.receipts).toEqual(
        [{ expenseId: money.a.expenseId, name: 'recibo.png' }],
      );
      expect(own.find((invoice) => invoice.id === money.billing.a.paidRequestId)?.receipts).toEqual(
        [],
      );
      const finance = await read(world.users.clientFinanceB, world.clients.b);
      expect(
        finance.flatMap((invoice) => invoice.receipts.map((receipt) => receipt.expenseId)),
      ).toEqual([money.b.expenseId]);
      expect(await read(world.users.decisionMakerA, world.clients.b)).toEqual([]);
    });
  }, 120_000);
});
