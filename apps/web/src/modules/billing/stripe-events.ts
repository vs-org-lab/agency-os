import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@agency-os/db';
import type { Currency, Locale } from '@agency-os/i18n';
import { recordAudit } from '@/modules/audit';
import { toMinorUnits } from '@/modules/contracts';
import { requestFlush } from '@/modules/events';
import { logger } from '@/platform/logger';
import type { VerifiedClaims } from '@/platform/db';
import { lisbonDate } from './domain/plan';
import { reconcileDecision } from './domain/reconcile';
import { applyReconciledPayment, emitPaymentReview } from './payments';
import {
  isCardCurrency,
  type PaymentsProvider,
  type ProviderEvent,
} from './payments-provider/port';
import { portalInvoicesUrl, type BillingDeps } from './requests';

const { paymentRequests, payments } = schema;

/** ISO 4217 code for a transaction without a currency, kept when the provider reports none. */
const NO_CURRENCY = 'XXX';

function currencyCode(value: string): string {
  const code = value.toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : NO_CURRENCY;
}

export type ProviderEventOutcome = 'reconciled' | 'review' | 'duplicate' | 'unmatched';

/**
 * Records a verified provider payment once (SEC-82): the event id is unique, so a replay finds
 * the existing row and changes nothing. Amount, currency and request must match (RN-33).
 */
export async function processProviderEvent(
  event: ProviderEvent,
  deps: BillingDeps,
): Promise<ProviderEventOutcome> {
  const now = (deps.now ?? (() => new Date()))();
  const requestId = z.uuid().safeParse(event.requestId).success ? event.requestId : null;

  const outcome = await deps.contexts.withSystemContext(async (tx) => {
    const [request] = requestId
      ? await tx
          .select()
          .from(paymentRequests)
          .where(eq(paymentRequests.id, requestId))
          .for('update')
      : [];
    if (!request || event.amountMinor <= 0n) return 'unmatched' as const;

    const status = reconcileDecision(request, {
      requestId: event.requestId,
      amountMinor: event.amountMinor,
      currency: event.currency,
    });
    const [payment] = await tx
      .insert(payments)
      .values({
        organizationId: request.organizationId,
        clientId: request.clientId,
        requestId: request.id,
        amount: sql`${event.amountMinor.toString()}::numeric / 100`,
        currency: currencyCode(event.currency),
        method: 'stripe',
        reference: event.reference.slice(0, 120),
        receivedOn: lisbonDate(now),
        status,
        providerEventId: event.id,
        reconciledAt: status === 'reconciled' ? now : null,
      })
      .onConflictDoNothing({ target: payments.providerEventId })
      .returning({ id: payments.id });
    if (!payment) return 'duplicate' as const;

    await recordAudit(tx, {
      organizationId: request.organizationId,
      action: 'payment.recorded',
      resourceType: 'payment',
      resourceId: payment.id,
      clientId: request.clientId,
      metadata: { requestId: request.id, method: 'stripe', status },
    });
    if (status === 'reconciled') {
      await applyReconciledPayment(tx, request, payment, deps, now);
    } else {
      await emitPaymentReview(tx, request, payment.id);
    }
    return status;
  });

  if (outcome === 'unmatched')
    logger.warn('billing.provider_event_unmatched', { eventId: event.id });
  if (outcome === 'reconciled' || outcome === 'review') await (deps.flush ?? requestFlush)();
  return outcome;
}

export type CheckoutDeps = BillingDeps & { provider: PaymentsProvider | null };

/** Opens a hosted card checkout for an open request the client is allowed to pay. */
export async function startCheckout(
  claims: VerifiedClaims,
  input: { requestId: string },
  deps: CheckoutDeps,
): Promise<{ ok: true; url: string } | { ok: false; rule: 'not_found' | 'unavailable' }> {
  if (!z.uuid().safeParse(input.requestId).success) return { ok: false, rule: 'not_found' };
  const rows = await deps.contexts.withUserContext(claims, (tx) =>
    tx.execute<{
      id: string;
      number: string;
      label: string;
      amount: string;
      currency: Currency;
      locale: Locale;
    }>(sql`
      select id, number, label, amount::text as amount, currency::text as currency,
             locale::text as locale
      from public.portal_payment_requests
      where id = ${input.requestId}::uuid and status = 'sent'
    `),
  );
  const request = rows[0];
  if (!request) return { ok: false, rule: 'not_found' };
  if (!deps.provider || !isCardCurrency(request.currency)) {
    return { ok: false, rule: 'unavailable' };
  }

  const invoicesUrl = portalInvoicesUrl(deps.appBaseUrl, request.locale);
  const checkout = await deps.provider.createCheckout({
    requestId: request.id,
    number: request.number,
    label: request.label,
    amountMinor: toMinorUnits(request.amount),
    currency: request.currency,
    locale: request.locale,
    successUrl: `${invoicesUrl}?paid=1`,
    cancelUrl: invoicesUrl,
  });
  return { ok: true, url: checkout.url };
}
