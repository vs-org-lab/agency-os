import { afterAll, describe, expect, it } from 'vitest';
import {
  addOrganizationMember,
  closeTestSql,
  createFixtureWorld,
  withTestTransaction,
} from '@agency-os/db/testing';
import type { VerifiedClaims } from '@/platform/db';
import { legalInvoiceUploadUrl, registerLegalInvoice } from './invoices';
import { recordPayment, settleReviewedPayment } from './payments';
import {
  chasePaymentRequest,
  createPlanForContract,
  createPlanForDeal,
  requestPayment,
  voidPaymentRequest,
} from './requests';
import { billingClaims, billingDeps, signedContract } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const TRANSFER = {
  method: 'bank_transfer' as const,
  amount: '6000.00',
  receivedOn: '2026-10-09',
  reference: 'TRF 1',
};

/** Claims whose last TOTP verification is older than the 15-minute window (SEC-03). */
function staleClaims(userId: string): VerifiedClaims {
  const claims = billingClaims(userId);
  return {
    ...claims,
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) - 60 * 60 }],
  };
}

describe('billing security', () => {
  it('voiding, recording, settling and registering require a recent verification', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);
      const requestId = plan.requestId ?? '';
      const stale = staleClaims(world.users.founder);
      const required = { ok: false, rule: 'reauthentication_required' };

      expect(await voidPaymentRequest(stale, { requestId, reason: 'Erro' }, deps)).toEqual(
        required,
      );
      expect(await recordPayment(stale, { requestId, ...TRANSFER }, deps)).toEqual(required);

      await recordPayment(
        billingClaims(world.users.founder),
        { requestId, ...TRANSFER, amount: '1.00' },
        deps,
      );
      const [payment] = await sql<{ id: string }[]>`
        select id from public.payments where request_id = ${requestId}
      `;
      expect(await settleReviewedPayment(stale, { paymentId: payment?.id ?? '' }, deps)).toEqual(
        required,
      );
      expect(
        await registerLegalInvoice(
          stale,
          {
            requestId,
            issuer: 'at_certified',
            number: 'FR 1',
            issuedOn: '2026-10-09',
            uploadPath: '',
          },
          deps,
        ),
      ).toEqual(required);
    });
  });

  it('a writer in one organisation cannot write billing of another where they only read', async () => {
    await withTestTransaction(async (sql) => {
      const own = await createFixtureWorld(sql);
      const other = await createFixtureWorld(sql);
      await addOrganizationMember(sql, {
        organizationId: other.organizationId,
        userId: own.users.finance,
        role: 'project_manager',
      });
      const contract = await signedContract(sql, other);
      const { deps } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);
      const requestId = plan.requestId ?? '';
      const [second] = await sql<{ id: string }[]>`
        select id from public.billing_milestones where contract_id = ${contract.contractId} and position = 2
      `;
      const claims = billingClaims(own.users.finance);
      const notFound = { ok: false, rule: 'not_found' };

      expect(await requestPayment(claims, { milestoneId: second?.id ?? '' }, deps)).toEqual(
        notFound,
      );
      expect(await chasePaymentRequest(claims, { requestId }, deps)).toEqual(notFound);
      expect(await voidPaymentRequest(claims, { requestId, reason: 'Erro' }, deps)).toEqual(
        notFound,
      );
      expect(await recordPayment(claims, { requestId, ...TRANSFER }, deps)).toEqual(notFound);
      expect(await legalInvoiceUploadUrl(claims, { requestId }, deps)).toEqual(notFound);
      expect(await createPlanForDeal(claims, { dealId: contract.dealId }, deps)).toEqual(notFound);

      await recordPayment(
        billingClaims(other.users.founder),
        { requestId, ...TRANSFER, amount: '1.00' },
        deps,
      );
      const [payment] = await sql<{ id: string }[]>`
        select id from public.payments where request_id = ${requestId}
      `;
      expect(await settleReviewedPayment(claims, { paymentId: payment?.id ?? '' }, deps)).toEqual(
        notFound,
      );
    });
  });
});
