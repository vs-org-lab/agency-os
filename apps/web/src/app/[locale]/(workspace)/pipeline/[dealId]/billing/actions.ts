'use server';

import type { RecordPaymentInput, RegisterLegalInvoiceInput } from '@/modules/billing';
import {
  chaseRequest,
  createDealPlan,
  legalInvoiceUploadLink,
  recordManualPayment,
  registerInvoice,
  requestMilestonePayment,
  settlePayment,
  voidRequest,
} from '@/modules/billing/server';
import { getVerifiedClaims } from '@/platform/session';
import type { BillingActionResult } from './billing-section';
import type { UploadLinkResult } from './billing-forms';

async function session() {
  const claims = await getVerifiedClaims();
  return claims ? { claims } : null;
}

function outcome(result: { ok: true } | { ok: false; rule: string }): BillingActionResult {
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}

export async function createPlanAction(dealId: string): Promise<BillingActionResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  return outcome(await createDealPlan(current, { dealId }));
}

export async function requestPaymentAction(milestoneId: string): Promise<BillingActionResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  return outcome(await requestMilestonePayment(current, { milestoneId }));
}

export async function chaseRequestAction(requestId: string): Promise<BillingActionResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  return outcome(await chaseRequest(current, { requestId }));
}

export async function voidRequestAction(
  requestId: string,
  reason: string,
): Promise<BillingActionResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  return outcome(await voidRequest(current, { requestId, reason }));
}

export async function recordPaymentAction(input: RecordPaymentInput): Promise<BillingActionResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  return outcome(await recordManualPayment(current, input));
}

export async function settlePaymentAction(paymentId: string): Promise<BillingActionResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  return outcome(await settlePayment(current, { paymentId }));
}

export async function invoiceUploadAction(requestId: string): Promise<UploadLinkResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  const result = await legalInvoiceUploadLink(current, { requestId });
  return result.ok ? result : { ok: false, code: result.rule };
}

export async function registerInvoiceAction(
  input: RegisterLegalInvoiceInput,
): Promise<BillingActionResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  return outcome(await registerInvoice(current, input));
}
