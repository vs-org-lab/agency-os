import type { ProviderEvent } from './payments-provider/port';
import { parseStripeWebhook } from './payments-provider/webhook';
import type { ProviderEventOutcome } from './stripe-events';

export type WebhookHandlerDeps = {
  /** The endpoint signing secret, or null when card payments are not configured. */
  secret: string | null;
  process: (event: ProviderEvent) => Promise<ProviderEventOutcome>;
};

/**
 * Answers a Stripe webhook delivery with the HTTP status Stripe acts on: 400 stops retries for
 * forged or altered bodies, 200 acknowledges, and a thrown error becomes a 500 that Stripe retries.
 */
export async function handleStripeWebhook(
  rawBody: string,
  signature: string | null,
  deps: WebhookHandlerDeps,
): Promise<200 | 400 | 503> {
  if (!deps.secret) return 503;
  const event = parseStripeWebhook(rawBody, signature, deps.secret);
  if (event === null) return 400;
  if (event !== 'ignored') await deps.process(event);
  return 200;
}
