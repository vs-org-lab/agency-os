'use server';

import { headers } from 'next/headers';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { RecordPaymentInput, RegisterLegalInvoiceInput } from '@/modules/billing';
import {
  chaseRequest,
  createDealPlan,
  legalInvoiceUploadLink,
  recordManualPayment,
  registerInvoice,
  requestMilestonePayment,
  setMilestoneLinkedPhase,
  settlePayment,
  voidRequest,
} from '@/modules/billing/server';
import { getVerifiedClaims } from '@/platform/session';
import type { BillingActionResult } from './billing-section';
import type { UploadLinkResult } from '@/components/billing/billing-forms';

async function session() {
  const claims = await getVerifiedClaims();
  return claims ? { claims } : null;
}

const LOCALE_PREFIX = /^\/(pt-PT|en)(?=\/|$)/;

/** Sends the caller to confirm a TOTP code and back to the page the action came from (SEC-03). */
async function reauthenticate(): Promise<never> {
  const referer = (await headers()).get('referer');
  const path = referer ? new URL(referer).pathname.replace(LOCALE_PREFIX, '') || '/' : '/';
  return redirect({
    href: `/mfa/verify?reason=reauthenticate&next=${encodeURIComponent(path)}`,
    locale: await getLocale(),
  });
}

async function outcome(
  result: { ok: true } | { ok: false; rule: string },
): Promise<BillingActionResult> {
  if (!result.ok && result.rule === 'reauthentication_required') return reauthenticate();
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}

export async function createPlanAction(dealId: string): Promise<BillingActionResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  return await outcome(await createDealPlan(current, { dealId }));
}

export async function requestPaymentAction(milestoneId: string): Promise<BillingActionResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  return await outcome(await requestMilestonePayment(current, { milestoneId }));
}

export async function chaseRequestAction(requestId: string): Promise<BillingActionResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  return await outcome(await chaseRequest(current, { requestId }));
}

export async function voidRequestAction(
  requestId: string,
  reason: string,
): Promise<BillingActionResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  return await outcome(await voidRequest(current, { requestId, reason }));
}

export async function recordPaymentAction(input: RecordPaymentInput): Promise<BillingActionResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  return await outcome(await recordManualPayment(current, input));
}

export async function settlePaymentAction(paymentId: string): Promise<BillingActionResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  return await outcome(await settlePayment(current, { paymentId }));
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
  return await outcome(await registerInvoice(current, input));
}

export async function linkMilestonePhaseAction(
  milestoneId: string,
  phaseId: string | null,
): Promise<BillingActionResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  return await outcome(await setMilestoneLinkedPhase(current, { milestoneId, phaseId }));
}
