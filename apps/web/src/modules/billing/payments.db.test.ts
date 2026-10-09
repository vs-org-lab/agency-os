import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { closeTestSql, createFixtureWorld, withTestTransaction } from '@agency-os/db/testing';
import { legalInvoiceUploadUrl, registerLegalInvoice } from './invoices';
import { recordPayment, settleReviewedPayment } from './payments';
import { createPlanForContract, requestPayment } from './requests';
import { billingClaims, billingDeps, signedContract } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const TRANSFER = {
  method: 'bank_transfer' as const,
  amount: '6000.00',
  receivedOn: '2026-10-09',
  reference: 'TRF 123',
};

async function requestStatus(sql: TransactionSql, requestId: string) {
  const [row] = await sql<{ status: string; milestone_status: string; paid: boolean }[]>`
    select r.status::text, m.status::text as milestone_status, r.paid_at is not null as paid
    from public.payment_requests r join public.billing_milestones m on m.id = r.milestone_id
    where r.id = ${requestId}
  `;
  return row;
}

async function auditActions(sql: TransactionSql, organizationId: string): Promise<string[]> {
  const rows = await sql<{ action: string }[]>`
    select action from public.audit_log
    where organization_id = ${organizationId} and action like 'payment%'
  `;
  return rows.map((row) => row.action).sort();
}

describe('payments', () => {
  it('manual payment pays the request and moves the deal to 2.2', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps, moved } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);
      const requestId = plan.requestId ?? '';

      const result = await recordPayment(
        billingClaims(world.users.finance),
        { requestId, ...TRANSFER },
        deps,
      );

      expect(result).toEqual({ ok: true, status: 'reconciled' });
      expect(await requestStatus(sql, requestId)).toEqual({
        status: 'paid',
        milestone_status: 'paid',
        paid: true,
      });
      expect(moved).toEqual([contract.dealId]);
      const events = await sql<{ type: string }[]>`
        select type from public.domain_events
        where organization_id = ${world.organizationId} and type like 'billing.payment.%'
      `;
      expect(events.map((event) => event.type)).toEqual(['billing.payment.received']);
    });
  });

  it('a second milestone payment does not move the deal', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps, moved } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);
      const claims = billingClaims(world.users.founder);
      await recordPayment(claims, { requestId: plan.requestId ?? '', ...TRANSFER }, deps);
      const [second] = await sql<{ id: string }[]>`
        select id from public.billing_milestones where contract_id = ${contract.contractId} and position = 2
      `;
      const next = await requestPayment(claims, { milestoneId: second?.id ?? '' }, deps);
      if (!next.ok) throw new Error('Second request was not issued');

      await recordPayment(claims, { requestId: next.requestId, ...TRANSFER }, deps);

      expect(moved).toEqual([contract.dealId]);
    });
  });

  it('a short payment goes to review and the deal stays', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps, moved } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);
      const requestId = plan.requestId ?? '';

      expect(
        await recordPayment(
          billingClaims(world.users.founder),
          { requestId, ...TRANSFER, method: 'multicaixa', amount: '5000.00' },
          deps,
        ),
      ).toEqual({ ok: true, status: 'review' });
      expect((await requestStatus(sql, requestId))?.status).toBe('sent');
      expect(moved).toEqual([]);
    });
  });

  it('settling a reviewed payment pays the request', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps, moved } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);
      const requestId = plan.requestId ?? '';
      const claims = billingClaims(world.users.founder);
      await recordPayment(claims, { requestId, ...TRANSFER, amount: '5999.00' }, deps);
      const [payment] = await sql<{ id: string }[]>`
        select id from public.payments where request_id = ${requestId}
      `;

      expect(
        await settleReviewedPayment(
          billingClaims(world.users.manager),
          { paymentId: payment?.id ?? '' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
      expect(await settleReviewedPayment(claims, { paymentId: payment?.id ?? '' }, deps)).toEqual({
        ok: true,
      });
      expect((await requestStatus(sql, requestId))?.status).toBe('paid');
      expect(moved).toEqual([contract.dealId]);
      expect(await settleReviewedPayment(claims, { paymentId: payment?.id ?? '' }, deps)).toEqual({
        ok: false,
        rule: 'invalid_state',
      });
    });
  });

  it('refuses invalid amounts, future dates and paid requests', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);
      const requestId = plan.requestId ?? '';
      const claims = billingClaims(world.users.founder);

      for (const change of [{ amount: '0' }, { amount: '12,5' }, { receivedOn: '2026-10-10' }]) {
        expect(await recordPayment(claims, { requestId, ...TRANSFER, ...change }, deps)).toEqual({
          ok: false,
          rule: 'invalid_input',
        });
      }
      await recordPayment(claims, { requestId, ...TRANSFER }, deps);
      expect(await recordPayment(claims, { requestId, ...TRANSFER }, deps)).toEqual({
        ok: false,
        rule: 'invalid_state',
      });
      expect(
        await recordPayment(billingClaims(world.users.manager), { requestId, ...TRANSFER }, deps),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });

  it('every manual change is audited', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);
      const requestId = plan.requestId ?? '';
      const claims = billingClaims(world.users.founder);
      await recordPayment(claims, { requestId, ...TRANSFER, amount: '1.00' }, deps);
      const [payment] = await sql<{ id: string }[]>`
        select id from public.payments where request_id = ${requestId}
      `;
      await settleReviewedPayment(claims, { paymentId: payment?.id ?? '' }, deps);

      expect(await auditActions(sql, world.organizationId)).toEqual([
        'payment.recorded',
        'payment.settled',
        'payment_request.sent',
      ]);
    });
  });
});

describe('legal invoices', () => {
  const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  const INVOICE = { issuer: 'at_certified' as const, number: 'FR 2026/14', issuedOn: '2026-10-09' };

  it('legal invoice requires a paid request and its uploaded pdf', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps, storage } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);
      const requestId = plan.requestId ?? '';
      const claims = billingClaims(world.users.founder);

      expect(await legalInvoiceUploadUrl(claims, { requestId }, deps)).toEqual({
        ok: false,
        rule: 'invalid_state',
      });
      await recordPayment(claims, { requestId, ...TRANSFER }, deps);
      const upload = await legalInvoiceUploadUrl(claims, { requestId }, deps);
      if (!upload.ok) throw new Error('Upload link was refused');
      const input = { requestId, ...INVOICE, uploadPath: upload.uploadPath };

      expect(await registerLegalInvoice(claims, input, deps)).toEqual({
        ok: false,
        rule: 'missing_file',
      });
      storage.files.set(upload.uploadPath, new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
      expect(await registerLegalInvoice(claims, input, deps)).toEqual({
        ok: false,
        rule: 'missing_file',
      });
      storage.files.set(upload.uploadPath, PDF);
      expect(await registerLegalInvoice(claims, input, deps)).toEqual({ ok: true });
      const [invoice] = await sql<{ number: string; pdf_path: string }[]>`
        select number, pdf_path from public.legal_invoices where request_id = ${requestId}
      `;
      expect(invoice).toEqual({ number: 'FR 2026/14', pdf_path: upload.uploadPath });
    });
  });

  it('each upload link gets its own path and a foreign path is refused', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps, storage } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);
      const requestId = plan.requestId ?? '';
      const claims = billingClaims(world.users.founder);
      await recordPayment(claims, { requestId, ...TRANSFER }, deps);

      const first = await legalInvoiceUploadUrl(claims, { requestId }, deps);
      const second = await legalInvoiceUploadUrl(claims, { requestId }, deps);
      if (!first.ok || !second.ok) throw new Error('Upload links were refused');
      const prefix = `${world.organizationId}/${contract.clientId}/invoices/${requestId}/`;
      expect(first.uploadPath.startsWith(prefix)).toBe(true);
      expect(second.uploadPath).not.toBe(first.uploadPath);

      const foreign = `${world.organizationId}/${contract.clientId}/requests/${requestId}.pdf`;
      storage.files.set(foreign, PDF);
      expect(
        await registerLegalInvoice(claims, { requestId, ...INVOICE, uploadPath: foreign }, deps),
      ).toEqual({ ok: false, rule: 'invalid_input' });
    });
  });

  it('one legal invoice per request, registered by founder or finance only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps, storage } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);
      const requestId = plan.requestId ?? '';
      const claims = billingClaims(world.users.finance);
      await recordPayment(claims, { requestId, ...TRANSFER }, deps);
      const upload = await legalInvoiceUploadUrl(claims, { requestId }, deps);
      if (!upload.ok) throw new Error('Upload link was refused');
      storage.files.set(upload.uploadPath, PDF);
      const input = { requestId, ...INVOICE, uploadPath: upload.uploadPath };

      expect(await registerLegalInvoice(billingClaims(world.users.manager), input, deps)).toEqual({
        ok: false,
        rule: 'not_found',
      });
      expect(await registerLegalInvoice(claims, input, deps)).toEqual({ ok: true });
      expect(await registerLegalInvoice(claims, input, deps)).toEqual({
        ok: false,
        rule: 'invalid_state',
      });
      expect(await legalInvoiceUploadUrl(claims, { requestId }, deps)).toEqual({
        ok: false,
        rule: 'invalid_state',
      });
    });
  });
});
