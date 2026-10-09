import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import type { ProviderEvent } from './payments-provider/port';
import { handleStripeWebhook } from './webhook-handler';

const SECRET = 'whsec_route_secret';

function signedBody(type = 'checkout.session.completed') {
  const body = JSON.stringify({
    id: 'evt_9',
    object: 'event',
    type,
    data: {
      object: {
        id: 'cs_9',
        object: 'checkout.session',
        amount_total: 1000,
        currency: 'eur',
        payment_status: 'paid',
        payment_intent: 'pi_9',
        metadata: { paymentRequestId: '6f1c2c43-46d4-4d55-9a3e-6c0f9b1d0a11' },
      },
    },
  });
  return {
    body,
    signature: Stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET }),
  };
}

describe('handleStripeWebhook', () => {
  it('processes a verified payment once and answers 200', async () => {
    const process = vi.fn(async (_event: ProviderEvent) => 'reconciled' as const);
    const { body, signature } = signedBody();

    expect(await handleStripeWebhook(body, signature, { secret: SECRET, process })).toBe(200);
    expect(process).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'evt_9', amountMinor: 1000n }),
    );
  });

  it('rejects a tampered payload with 400 and records nothing', async () => {
    const process = vi.fn();
    const { body, signature } = signedBody();

    expect(
      await handleStripeWebhook(body.replace('1000', '1'), signature, { secret: SECRET, process }),
    ).toBe(400);
    expect(process).not.toHaveBeenCalled();
  });

  it('acknowledges events that settle nothing', async () => {
    const process = vi.fn();
    const { body, signature } = signedBody('checkout.session.expired');

    expect(await handleStripeWebhook(body, signature, { secret: SECRET, process })).toBe(200);
    expect(process).not.toHaveBeenCalled();
  });

  it('answers 503 when payments are not configured', async () => {
    const { body, signature } = signedBody();

    expect(await handleStripeWebhook(body, signature, { secret: null, process: vi.fn() })).toBe(
      503,
    );
  });
});
