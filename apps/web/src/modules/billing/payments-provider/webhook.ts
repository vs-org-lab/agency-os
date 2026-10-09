import Stripe from 'stripe';
import type { ProviderEvent } from './port';

const SETTLED_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
]);

/**
 * Verifies a Stripe webhook signature and extracts the settled payment it reports. Returns null
 * for an invalid or missing signature and 'ignored' for events that do not settle money.
 */
export function parseStripeWebhook(
  rawBody: string,
  signature: string | null,
  secret: string,
): ProviderEvent | 'ignored' | null {
  if (!signature) return null;
  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return null;
  }
  if (!SETTLED_EVENTS.has(event.type)) return 'ignored';
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== 'paid') return 'ignored';

  const paymentIntent =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;
  return {
    id: event.id,
    requestId: session.metadata?.paymentRequestId ?? null,
    amountMinor: BigInt(session.amount_total ?? 0),
    currency: (session.currency ?? '').toUpperCase(),
    reference: paymentIntent ?? session.id,
  };
}
