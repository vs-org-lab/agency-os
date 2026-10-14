import 'server-only';
import { createSupabaseLibraryStorage } from '@/modules/library/server';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import { receiptReader } from '@/platform/receipt-reader';
import type { MoneyDeps } from './access';
import { deleteExpense, linkExpense, saveExpense, type ExpenseInput } from './expenses';
import { expenseReceiptUrl, loadMoneyYear } from './readers';
import { readReceipt, startReceiptUpload } from './receipts';
import {
  cancelSubscription,
  renewSubscription,
  saveSubscription,
  type SubscriptionInput,
} from './subscriptions';

const deps = (): MoneyDeps => ({
  contexts: { withUserContext, withSystemContext },
  storage: createSupabaseLibraryStorage(),
  reader: receiptReader() ?? undefined,
});

export const beginReceiptUpload = (
  claims: VerifiedClaims,
  input: { fileName: string; sizeBytes: number },
) => startReceiptUpload(claims, input, deps());
export const proposeFromReceipt = (claims: VerifiedClaims, receiptId: string) =>
  readReceipt(claims, receiptId, deps());
export const storeExpense = (claims: VerifiedClaims, input: ExpenseInput) =>
  saveExpense(claims, input, deps());
export const removeExpense = (claims: VerifiedClaims, id: string) =>
  deleteExpense(claims, id, deps());
export const attachExpense = (
  claims: VerifiedClaims,
  input: { expenseId: string; paymentRequestId: string | null },
) => linkExpense(claims, input, deps());
export const storeSubscription = (claims: VerifiedClaims, input: SubscriptionInput) =>
  saveSubscription(claims, input, deps());
export const endSubscription = (claims: VerifiedClaims, id: string) =>
  cancelSubscription(claims, id, deps());
export const recordRenewal = (
  claims: VerifiedClaims,
  input: { id: string; receiptId?: string; receiptName?: string },
) => renewSubscription(claims, input, deps());

export const loadMoneyYearView = (claims: VerifiedClaims, year: number) =>
  loadMoneyYear(claims, year, deps());
export const moneyReceiptUrl = (claims: VerifiedClaims, expenseId: string) =>
  expenseReceiptUrl(claims, expenseId, deps());
