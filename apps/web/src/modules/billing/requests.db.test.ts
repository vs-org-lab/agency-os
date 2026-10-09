import { afterAll, describe, expect, it } from 'vitest';
import { closeTestSql, createFixtureWorld, withTestTransaction } from '@agency-os/db/testing';
import {
  chasePaymentRequest,
  createPlanForContract,
  requestPayment,
  voidPaymentRequest,
} from './requests';
import { billingClaims, billingDeps, BILLING_TEST_NOW, signedContract } from './testing';

afterAll(async () => {
  await closeTestSql();
});

describe('payment plans and requests', () => {
  it('signing creates the plan and the first request once', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps, storage } = billingDeps(sql);

      const first = await createPlanForContract(contract.contractId, deps);
      const second = await createPlanForContract(contract.contractId, deps);

      expect(first.created).toBe(true);
      expect(second).toEqual({ created: false, requestId: null });
      const milestones = await sql<{ position: number; amount: string; status: string }[]>`
        select position, amount::text, status::text from public.billing_milestones
        where contract_id = ${contract.contractId} order by position
      `;
      expect(milestones).toEqual([
        { position: 1, amount: '6000.00', status: 'requested' },
        { position: 2, amount: '6000.00', status: 'pending' },
      ]);
      const [request] = await sql<
        {
          id: string;
          number: string;
          amount: string;
          currency: string;
          due_date: string;
          pdf_path: string;
          issuer_details: { iban: string; legalName: string };
          client_details: { legalName: string };
        }[]
      >`
        select id, number, amount::text, currency::text, due_date::text, pdf_path, issuer_details,
               client_details
        from public.payment_requests where deal_id = ${contract.dealId}
      `;
      expect(request?.id).toBe(first.requestId);
      expect(request).toMatchObject({
        number: 'PP-2026-0001',
        amount: '6000.00',
        currency: 'EUR',
        issuer_details: { iban: 'PT50000201231234567890154', legalName: 'Aurion Creative Lda' },
        client_details: { legalName: 'Empresa Cliente SA' },
      });
      expect(storage.files.has(request?.pdf_path ?? '')).toBe(true);
      const events = await sql<{ type: string }[]>`
        select type from public.domain_events where type = 'billing.request.sent'
          and organization_id = ${world.organizationId}
      `;
      expect(events).toHaveLength(1);
    });
  });

  it('first request is due in seven days', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps } = billingDeps(sql);
      await createPlanForContract(contract.contractId, deps);

      const [request] = await sql<{ due_date: string }[]>`
        select due_date::text from public.payment_requests where deal_id = ${contract.dealId}
      `;
      expect(request?.due_date).toBe('2026-10-16');
    });
  });

  it('an unsigned contract gets no plan', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await signedContract(sql, world);
      const [unsigned] = await sql<{ id: string }[]>`
        select id from public.contracts where client_id = ${world.clients.b}
      `;
      const { deps } = billingDeps(sql);

      expect(await createPlanForContract(unsigned?.id ?? '', deps)).toEqual({
        created: false,
        requestId: null,
      });
    });
  });

  it('requests get consecutive numbers from the shared counter', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps } = billingDeps(sql);
      await createPlanForContract(contract.contractId, deps);
      const [second] = await sql<{ id: string }[]>`
        select id from public.billing_milestones where contract_id = ${contract.contractId} and position = 2
      `;

      const result = await requestPayment(
        billingClaims(world.users.finance),
        { milestoneId: second?.id ?? '' },
        deps,
      );

      expect(result.ok).toBe(true);
      const numbers = await sql<{ number: string }[]>`
        select number from public.payment_requests where organization_id = ${world.organizationId}
        order by number
      `;
      expect(numbers.map((row) => row.number)).toEqual(['PP-2026-0001', 'PP-2026-0002']);
    });
  });

  it('manager cannot request payment and a requested milestone is not requested twice', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps } = billingDeps(sql);
      await createPlanForContract(contract.contractId, deps);
      const milestones = await sql<{ id: string; position: number }[]>`
        select id, position from public.billing_milestones where contract_id = ${contract.contractId}
        order by position
      `;

      expect(
        await requestPayment(
          billingClaims(world.users.manager),
          { milestoneId: milestones[1]?.id ?? '' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
      expect(
        await requestPayment(
          billingClaims(world.users.founder),
          { milestoneId: milestones[0]?.id ?? '' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_state' });
    });
  });

  it('voiding frees the milestone and a paid request cannot be voided', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);
      const requestId = plan.requestId ?? '';
      const claims = billingClaims(world.users.founder);

      expect(await voidPaymentRequest(claims, { requestId, reason: '' }, deps)).toEqual({
        ok: false,
        rule: 'invalid_input',
      });
      expect(await voidPaymentRequest(claims, { requestId, reason: 'Valor errado' }, deps)).toEqual(
        { ok: true },
      );
      const [milestone] = await sql<{ status: string }[]>`
        select m.status::text from public.billing_milestones m
        join public.payment_requests r on r.milestone_id = m.id where r.id = ${requestId}
      `;
      expect(milestone?.status).toBe('pending');

      const again = await requestPayment(
        claims,
        { milestoneId: (await milestoneOf(sql, requestId)) ?? '' },
        deps,
      );
      if (!again.ok) throw new Error('Milestone was not requested again');
      await sql`update public.payment_requests set status = 'paid', paid_at = now() where id = ${again.requestId}`;
      expect(
        await voidPaymentRequest(claims, { requestId: again.requestId, reason: 'Tarde' }, deps),
      ).toEqual({ ok: false, rule: 'invalid_state' });
    });
  });

  it('chasing twice in a day is refused', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);
      const claims = billingClaims(world.users.finance);
      const input = { requestId: plan.requestId ?? '' };

      expect(await chasePaymentRequest(claims, input, deps)).toEqual({ ok: true });
      expect(await chasePaymentRequest(claims, input, deps)).toEqual({
        ok: false,
        rule: 'too_soon',
      });
      const tomorrow = new Date(BILLING_TEST_NOW.getTime() + 24 * 60 * 60 * 1000);
      expect(await chasePaymentRequest(claims, input, { ...deps, now: () => tomorrow })).toEqual({
        ok: true,
      });
      const events = await sql<{ type: string }[]>`
        select type from public.domain_events where type = 'billing.request.reminded'
          and organization_id = ${world.organizationId}
      `;
      expect(events).toHaveLength(2);
    });
  });
});

async function milestoneOf(
  sql: Parameters<Parameters<typeof withTestTransaction>[0]>[0],
  requestId: string,
): Promise<string | undefined> {
  const [row] = await sql<{ milestone_id: string }[]>`
    select milestone_id from public.payment_requests where id = ${requestId}
  `;
  return row?.milestone_id;
}
