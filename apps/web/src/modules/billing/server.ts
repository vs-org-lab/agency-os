import 'server-only';
import Stripe from 'stripe';
import type { DbTransaction } from '@agency-os/db';
import { applyStageChange } from '@/modules/commercial/server';
import { commercialEnv, paymentsEnv } from '@/platform/env';
import { logger } from '@/platform/logger';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import {
  legalInvoiceUploadUrl,
  registerLegalInvoice,
  type RegisterLegalInvoiceInput,
} from './invoices';
import { recordPayment, settleReviewedPayment, type RecordPaymentInput } from './payments';
import type { PaymentsProvider } from './payments-provider/port';
import { createStripeProvider } from './payments-provider/stripe';
import {
  chasePaymentRequest,
  createPlanForContract,
  requestPayment,
  voidPaymentRequest,
  type BillingDeps,
} from './requests';
import { processProviderEvent, startCheckout } from './stripe-events';
import { createSupabaseBillingStorage } from './supabase-storage';
import { handleStripeWebhook } from './webhook-handler';

/** The stage a deal enters with its first reconciled payment (AUT-13). */
const KICKOFF_CODE = '2.2';

async function moveDealToKickoff(tx: DbTransaction, dealId: string): Promise<void> {
  const change = await applyStageChange(tx, {
    dealId,
    to: KICKOFF_CODE,
    reason: null,
    actor: 'system',
  });
  if (!change.ok) logger.warn('billing.deal_not_moved', { dealId, rule: change.rule });
}

export function billingDeps(): BillingDeps {
  return {
    contexts: { withUserContext, withSystemContext },
    storage: createSupabaseBillingStorage(),
    appBaseUrl: commercialEnv().APP_BASE_URL,
    moveDeal: moveDealToKickoff,
  };
}

let stripeClient: Stripe | undefined;

function paymentsProvider(): PaymentsProvider | null {
  const env = paymentsEnv();
  if (env.PAYMENTS_PROVIDER !== 'stripe') return null;
  stripeClient ??= new Stripe(env.STRIPE_SECRET_KEY);
  return createStripeProvider(stripeClient.checkout.sessions);
}

/** True when the portal can offer card payments for EUR, GBP and USD requests. */
export function cardPaymentsEnabled(): boolean {
  return paymentsEnv().PAYMENTS_PROVIDER === 'stripe';
}

export type BillingSession = { claims: VerifiedClaims };

export function planForSignedContract(contractId: string) {
  return createPlanForContract(contractId, billingDeps());
}

export function requestMilestonePayment(session: BillingSession, input: { milestoneId: string }) {
  return requestPayment(session.claims, input, billingDeps());
}

export function voidRequest(session: BillingSession, input: { requestId: string; reason: string }) {
  return voidPaymentRequest(session.claims, input, billingDeps());
}

export function chaseRequest(session: BillingSession, input: { requestId: string }) {
  return chasePaymentRequest(session.claims, input, billingDeps());
}

export function recordManualPayment(session: BillingSession, input: RecordPaymentInput) {
  return recordPayment(session.claims, input, billingDeps());
}

export function settlePayment(session: BillingSession, input: { paymentId: string }) {
  return settleReviewedPayment(session.claims, input, billingDeps());
}

export function legalInvoiceUploadLink(session: BillingSession, input: { requestId: string }) {
  return legalInvoiceUploadUrl(session.claims, input, billingDeps());
}

export function registerInvoice(session: BillingSession, input: RegisterLegalInvoiceInput) {
  return registerLegalInvoice(session.claims, input, billingDeps());
}

export function startPortalCheckout(claims: VerifiedClaims, input: { requestId: string }) {
  return startCheckout(claims, input, { ...billingDeps(), provider: paymentsProvider() });
}

export function receiveStripeWebhook(rawBody: string, signature: string | null) {
  const env = paymentsEnv();
  return handleStripeWebhook(rawBody, signature, {
    secret: env.PAYMENTS_PROVIDER === 'stripe' ? env.STRIPE_WEBHOOK_SECRET : null,
    process: (event) => processProviderEvent(event, billingDeps()),
  });
}
