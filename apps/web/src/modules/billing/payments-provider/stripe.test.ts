import { describe, expect, it, vi } from 'vitest';
import { createStripeProvider, type CheckoutSessions } from './stripe';

describe('createStripeProvider', () => {
  it('opens a hosted checkout for the exact request amount', async () => {
    const create = vi.fn<CheckoutSessions['create']>(async () => ({
      url: 'https://checkout.stripe.test/c/1',
    }));
    const provider = createStripeProvider({ create });

    const result = await provider.createCheckout({
      requestId: '6f1c2c43-46d4-4d55-9a3e-6c0f9b1d0a11',
      number: 'PP-2026-0001',
      label: 'Assinatura',
      amountMinor: 600000n,
      currency: 'EUR',
      locale: 'pt-PT',
      successUrl: 'https://app.test/pt-PT/portal/invoices?paid=1',
      cancelUrl: 'https://app.test/pt-PT/portal/invoices',
    });

    expect(result).toEqual({ url: 'https://checkout.stripe.test/c/1' });
    expect(create).toHaveBeenCalledWith(
      {
        mode: 'payment',
        client_reference_id: 'PP-2026-0001',
        metadata: { paymentRequestId: '6f1c2c43-46d4-4d55-9a3e-6c0f9b1d0a11' },
        payment_intent_data: {
          description: 'PP-2026-0001',
          metadata: { paymentRequestId: '6f1c2c43-46d4-4d55-9a3e-6c0f9b1d0a11' },
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'eur',
              unit_amount: 600000,
              product_data: { name: 'PP-2026-0001 · Assinatura' },
            },
          },
        ],
        locale: 'pt',
        success_url: 'https://app.test/pt-PT/portal/invoices?paid=1',
        cancel_url: 'https://app.test/pt-PT/portal/invoices',
      },
      { idempotencyKey: expect.stringMatching(/^checkout-6f1c2c43-46d4-4d55-9a3e-6c0f9b1d0a11-/) },
    );
  });

  it('fails when the provider returns no checkout link', async () => {
    const provider = createStripeProvider({ create: async () => ({ url: null }) });

    await expect(
      provider.createCheckout({
        requestId: 'r',
        number: 'PP-2026-0001',
        label: 'Assinatura',
        amountMinor: 100n,
        currency: 'USD',
        locale: 'en',
        successUrl: 'https://app.test/s',
        cancelUrl: 'https://app.test/c',
      }),
    ).rejects.toThrow('Checkout session has no link');
  });
});
