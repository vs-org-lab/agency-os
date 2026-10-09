import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { parseStripeWebhook } from './webhook';

const SECRET = 'whsec_test_secret';
const REQUEST_ID = '6f1c2c43-46d4-4d55-9a3e-6c0f9b1d0a11';

function signed(event: object, secret = SECRET): { body: string; signature: string } {
  const body = JSON.stringify(event);
  return { body, signature: Stripe.webhooks.generateTestHeaderString({ payload: body, secret }) };
}

function sessionEvent(type: string, session: Record<string, unknown>) {
  return {
    id: 'evt_123',
    object: 'event',
    type,
    data: {
      object: {
        id: 'cs_test_1',
        object: 'checkout.session',
        amount_total: 600000,
        currency: 'eur',
        payment_status: 'paid',
        payment_intent: 'pi_123',
        metadata: { paymentRequestId: REQUEST_ID },
        ...session,
      },
    },
  };
}

describe('parseStripeWebhook', () => {
  it('reads a signed completed checkout', () => {
    const { body, signature } = signed(sessionEvent('checkout.session.completed', {}));

    expect(parseStripeWebhook(body, signature, SECRET)).toEqual({
      id: 'evt_123',
      requestId: REQUEST_ID,
      amountMinor: 600000n,
      currency: 'EUR',
      reference: 'pi_123',
    });
  });

  it('reads an asynchronous payment that succeeded later', () => {
    const { body, signature } = signed(
      sessionEvent('checkout.session.async_payment_succeeded', { payment_intent: null }),
    );

    expect(parseStripeWebhook(body, signature, SECRET)).toMatchObject({
      requestId: REQUEST_ID,
      reference: 'cs_test_1',
    });
  });

  it('rejects a tampered payload, a missing signature and another secret', () => {
    const { body, signature } = signed(sessionEvent('checkout.session.completed', {}));
    const tampered = body.replace('600000', '1');
    const foreign = signed(sessionEvent('checkout.session.completed', {}), 'whsec_other');

    expect(parseStripeWebhook(tampered, signature, SECRET)).toBeNull();
    expect(parseStripeWebhook(body, null, SECRET)).toBeNull();
    expect(parseStripeWebhook(foreign.body, foreign.signature, SECRET)).toBeNull();
  });

  it('ignores other events and sessions still waiting for the money', () => {
    const other = signed({
      id: 'evt_2',
      object: 'event',
      type: 'customer.created',
      data: { object: {} },
    });
    const unpaid = signed(sessionEvent('checkout.session.completed', { payment_status: 'unpaid' }));

    expect(parseStripeWebhook(other.body, other.signature, SECRET)).toBe('ignored');
    expect(parseStripeWebhook(unpaid.body, unpaid.signature, SECRET)).toBe('ignored');
  });

  it('keeps a session without a request reference for review', () => {
    const { body, signature } = signed(
      sessionEvent('checkout.session.completed', { metadata: {} }),
    );

    expect(parseStripeWebhook(body, signature, SECRET)).toMatchObject({ requestId: null });
  });
});
