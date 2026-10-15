'use server';

import type { ExpenseFormInput, MoneyResult } from '@/components/money/expense-form';
import type { SubscriptionFormInput } from '@/components/money/subscriptions-list';
import {
  attachExpense,
  beginReceiptUpload,
  endSubscription,
  proposeFromReceipt,
  recordRenewal,
  removeExpense,
  storeExpense,
  storeSubscription,
} from '@/modules/money/server';
import type { ReceiptProposal } from '@/platform/receipt-reader';
import { getVerifiedClaims } from '@/platform/session';

const NOT_FOUND = { ok: false, code: 'not_found' } as const;

type Claims = NonNullable<Awaited<ReturnType<typeof getVerifiedClaims>>>;

async function run(
  action: (claims: Claims) => Promise<{ ok: true } | { ok: false; rule: string }>,
): Promise<MoneyResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return NOT_FOUND;
  const result = await action(claims);
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}

export async function startReceiptUploadAction(input: {
  fileName: string;
  sizeBytes: number;
}): Promise<{ ok: true; receiptId: string; uploadUrl: string } | { ok: false; code: string }> {
  const claims = await getVerifiedClaims();
  if (!claims) return NOT_FOUND;
  const result = await beginReceiptUpload(claims, input);
  return result.ok ? result : { ok: false, code: result.rule };
}

export async function readReceiptAction(
  receiptId: string,
): Promise<
  { ok: true; mimeType: string; proposal: ReceiptProposal | null } | { ok: false; code: string }
> {
  const claims = await getVerifiedClaims();
  if (!claims) return NOT_FOUND;
  const result = await proposeFromReceipt(claims, receiptId);
  return result.ok ? result : { ok: false, code: result.rule };
}

export async function saveExpenseAction(input: ExpenseFormInput): Promise<MoneyResult> {
  return run((claims) => storeExpense(claims, input));
}

export async function deleteExpenseAction(expenseId: string): Promise<MoneyResult> {
  return run((claims) => removeExpense(claims, expenseId));
}

export async function linkExpenseAction(
  expenseId: string,
  paymentRequestId: string | null,
): Promise<MoneyResult> {
  return run((claims) => attachExpense(claims, { expenseId, paymentRequestId }));
}

export async function saveSubscriptionAction(input: SubscriptionFormInput): Promise<MoneyResult> {
  return run((claims) => storeSubscription(claims, input));
}

export async function renewSubscriptionAction(subscriptionId: string): Promise<MoneyResult> {
  return run((claims) => recordRenewal(claims, { id: subscriptionId }));
}

export async function cancelSubscriptionAction(subscriptionId: string): Promise<MoneyResult> {
  return run((claims) => endSubscription(claims, subscriptionId));
}
