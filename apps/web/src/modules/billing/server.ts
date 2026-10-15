import 'server-only';
import Stripe from 'stripe';
import { paymentsEnv } from '@/platform/env';
import { withUserContext, type VerifiedClaims } from '@/platform/db';
import {
  legalInvoiceUploadUrl,
  registerLegalInvoice,
  type RegisterLegalInvoiceInput,
} from './invoices';
import { setMilestonePhase } from './links';
import { recordPayment, settleReviewedPayment, type RecordPaymentInput } from './payments';
import type { PaymentsProvider } from './payments-provider/port';
import { getPortalInvoices } from './portal';
import { createStripeProvider } from './payments-provider/stripe';
import {
  chasePaymentRequest,
  createPlanForDeal,
  requestPayment,
  voidPaymentRequest,
} from './requests';
import { billingDeps } from './runtime';
import type { BillingDeps } from './requests';
import { processProviderEvent, startCheckout } from './stripe-events';
import { lisbonDate } from './domain/plan';
import { handleStripeWebhook } from './webhook-handler';
import { billingPdfUrl, getDealBilling, hasSignedContract, type BillingPdfKind } from './workspace';

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

export function requestMilestonePayment(session: BillingSession, input: { milestoneId: string }) {
  return requestPayment(session.claims, input, billingDeps());
}

/** Moves a pending phase-approval milestone to another approval phase, or unlinks it. */
export function setMilestoneLinkedPhase(
  session: BillingSession,
  input: { milestoneId: string; phaseId: string | null },
) {
  return setMilestonePhase(session.claims, input, billingDeps());
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

export async function loadDealBilling(session: BillingSession, dealId: string) {
  return withUserContext(session.claims, async (tx) => {
    const billing = await getDealBilling(tx, dealId, lisbonDate(new Date()));
    return { billing, canCreatePlan: !billing && (await hasSignedContract(tx, dealId)) };
  });
}

export function createDealPlan(session: BillingSession, input: { dealId: string }) {
  return createPlanForDeal(session.claims, input, billingDeps());
}

export function billingPdfLink(
  claims: VerifiedClaims,
  input: { kind: BillingPdfKind; id: string },
) {
  return billingPdfUrl(claims, input, billingDeps());
}

export function loadPortalInvoices(claims: VerifiedClaims, clientId: string) {
  return withUserContext(claims, (tx) => getPortalInvoices(tx, clientId, lisbonDate(new Date())));
}
export { BILLING_FUNCTIONS } from './automations';
export { signedContractFor, type SignedContractRef } from './parties';
export {
  issuePaymentRequest,
  REQUEST_DUE_DAYS,
  type PaymentRequestInput,
  type PaymentRequestOrigin,
} from './requests';
export { createMemoryBillingStorage } from './storage';

/** What another module needs to issue payment requests: the PDF storage and the portal URL. */
export function billingIssueDeps(): Pick<BillingDeps, 'storage' | 'appBaseUrl'> {
  const { storage, appBaseUrl } = billingDeps();
  return { storage, appBaseUrl };
}
export type { BillingDeps } from './requests';
export { clientPaymentsSuspended } from './overdue';
