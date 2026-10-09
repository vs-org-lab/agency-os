import type Stripe from 'stripe';
import type { Locale } from '@agency-os/i18n';
import type { PaymentsProvider } from './port';

export type CheckoutSessions = {
  create(
    params: Stripe.Checkout.SessionCreateParams,
    options: { idempotencyKey: string },
  ): Promise<{ url: string | null }>;
};

const CHECKOUT_LOCALES: Record<Locale, Stripe.Checkout.SessionCreateParams.Locale> = {
  'pt-PT': 'pt',
  en: 'en',
};

/** Repeated clicks within this window reuse the same Checkout session. */
const IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000;

export function createStripeProvider(
  sessions: CheckoutSessions,
  now: () => Date = () => new Date(),
): PaymentsProvider {
  return {
    async createCheckout(input) {
      const metadata = { paymentRequestId: input.requestId };
      const window = Math.floor(now().getTime() / IDEMPOTENCY_WINDOW_MS);
      const session = await sessions.create(
        {
          mode: 'payment',
          client_reference_id: input.number,
          metadata,
          payment_intent_data: { description: input.number, metadata },
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: input.currency.toLowerCase(),
                unit_amount: Number(input.amountMinor),
                product_data: { name: `${input.number} · ${input.label}` },
              },
            },
          ],
          locale: CHECKOUT_LOCALES[input.locale],
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
        },
        { idempotencyKey: `checkout-${input.requestId}-${window}` },
      );
      if (!session.url) throw new Error('Checkout session has no link');
      return { url: session.url };
    },
  };
}
