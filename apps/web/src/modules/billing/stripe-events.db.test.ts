import { afterAll, describe, expect, it, vi } from 'vitest';
import { closeTestSql, createFixtureWorld, withTestTransaction } from '@agency-os/db/testing';
import type { CheckoutInput, PaymentsProvider } from './payments-provider/port';
import { createPlanForContract } from './requests';
import { processProviderEvent, startCheckout } from './stripe-events';
import { billingClaims, billingDeps, signedContract } from './testing';

afterAll(async () => {
  await closeTestSql();
});

function event(
  requestId: string | null,
  overrides: Partial<{ amountMinor: bigint; currency: string; id: string }> = {},
) {
  return {
    id: overrides.id ?? 'evt_1',
    requestId,
    amountMinor: overrides.amountMinor ?? 600000n,
    currency: overrides.currency ?? 'EUR',
    reference: 'pi_1',
  };
}

describe('provider events', () => {
  it('a matching event reconciles and moves the deal', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps, moved } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);

      expect(await processProviderEvent(event(plan.requestId), deps)).toBe('reconciled');
      const [payment] = await sql<{ method: string; status: string; recorded_by: string | null }[]>`
        select method::text, status::text, recorded_by from public.payments
        where request_id = ${plan.requestId}
      `;
      expect(payment).toEqual({ method: 'stripe', status: 'reconciled', recorded_by: null });
      expect(moved).toEqual([contract.dealId]);
    });
  });

  it('a replayed event records one payment', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps, moved } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);

      await processProviderEvent(event(plan.requestId), deps);
      expect(await processProviderEvent(event(plan.requestId), deps)).toBe('duplicate');
      const payments =
        await sql`select id from public.payments where request_id = ${plan.requestId}`;
      expect(payments).toHaveLength(1);
      expect(moved).toEqual([contract.dealId]);
    });
  });

  it('a short payment or another currency goes to review', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps, moved } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);

      expect(
        await processProviderEvent(event(plan.requestId, { amountMinor: 500000n }), deps),
      ).toBe('review');
      expect(
        await processProviderEvent(event(plan.requestId, { id: 'evt_2', currency: 'USD' }), deps),
      ).toBe('review');
      const [request] = await sql<{ status: string }[]>`
        select status::text from public.payment_requests where id = ${plan.requestId}
      `;
      expect(request?.status).toBe('sent');
      expect(moved).toEqual([]);
    });
  });

  it('an event for an unknown request records nothing', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await signedContract(sql, world);
      const { deps } = billingDeps(sql);

      expect(await processProviderEvent(event(null), deps)).toBe('unmatched');
      expect(
        await processProviderEvent(
          event('6f1c2c43-46d4-4d55-9a3e-6c0f9b1d0a11', { id: 'evt_3' }),
          deps,
        ),
      ).toBe('unmatched');
    });
  });
});

describe('startCheckout', () => {
  function providerSpy() {
    const createCheckout = vi.fn<PaymentsProvider['createCheckout']>(async () => ({
      url: 'https://checkout.stripe.test/c/1',
    }));
    return { provider: { createCheckout }, createCheckout };
  }

  it('opens checkout for the decision maker with the request amount', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);
      const { provider, createCheckout } = providerSpy();

      const result = await startCheckout(
        billingClaims(world.users.decisionMakerA, 'client'),
        { requestId: plan.requestId ?? '' },
        { ...deps, provider },
      );

      expect(result).toEqual({ ok: true, url: 'https://checkout.stripe.test/c/1' });
      expect(createCheckout).toHaveBeenCalledWith(
        expect.objectContaining<Partial<CheckoutInput>>({
          requestId: plan.requestId ?? '',
          number: 'PP-2026-0001',
          amountMinor: 600000n,
          currency: 'EUR',
          successUrl: 'https://app.aurion.test/pt-PT/portal/invoices?paid=1',
        }),
      );
    });
  });

  it('operational cannot start checkout', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);
      const { provider, createCheckout } = providerSpy();

      expect(
        await startCheckout(
          billingClaims(world.users.operationalA, 'client'),
          { requestId: plan.requestId ?? '' },
          { ...deps, provider },
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
      expect(createCheckout).not.toHaveBeenCalled();
    });
  });

  it('kwanza requests never open checkout and nothing opens without a provider', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps } = billingDeps(sql);
      const plan = await createPlanForContract(contract.contractId, deps);
      const { provider, createCheckout } = providerSpy();
      const claims = billingClaims(world.users.decisionMakerA, 'client');
      const input = { requestId: plan.requestId ?? '' };

      expect(await startCheckout(claims, input, { ...deps, provider: null })).toEqual({
        ok: false,
        rule: 'unavailable',
      });
      await sql`reset role`;
      await sql`update public.payment_requests set currency = 'AOA' where id = ${plan.requestId}`;
      expect(await startCheckout(claims, input, { ...deps, provider })).toEqual({
        ok: false,
        rule: 'unavailable',
      });
      expect(createCheckout).not.toHaveBeenCalled();
    });
  });
});
