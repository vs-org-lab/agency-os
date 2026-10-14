import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction } from '@agency-os/db';
import { recordAudit, type AuditAction } from '@/modules/audit';
import type { VerifiedClaims } from '@/platform/db';
import {
  INVALID_FILE,
  INVALID_INPUT,
  INVALID_STATE,
  moneyActor,
  NOT_FOUND,
  OK,
  type MoneyDeps,
  type NotFound,
} from './access';
import { EXPENSE_CATEGORIES } from './domain/categories';
import { CURRENCIES } from './domain/summary';
import { receiptIdSchema, receiptPath, verifiedReceipt } from './receipts';

const { clients, expenses, paymentRequests, subscriptions } = schema;

/** A calendar date that exists, as YYYY-MM-DD. */
export const isoDate = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
});

/** A positive amount with at most two decimals. */
export const moneyAmount = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/)
  .refine((value) => Number(value) > 0);

const expenseSchema = z.object({
  id: z.uuid().optional(),
  spentOn: isoDate,
  vendor: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(''),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: moneyAmount,
  currency: z.enum(CURRENCIES),
  clientId: z.uuid().optional(),
  receiptId: receiptIdSchema.optional(),
  receiptName: z.string().trim().min(1).max(200).optional(),
  subscriptionId: z.uuid().optional(),
});

/** What a form sends; every field is checked against the schema before use. */
export type ExpenseInput = {
  id?: string;
  spentOn: string;
  vendor: string;
  description?: string;
  category: string;
  amount: string;
  currency: string;
  clientId?: string;
  receiptId?: string;
  receiptName?: string;
  subscriptionId?: string;
};

type ExpenseRow = typeof expenses.$inferSelect;

async function audit(
  tx: DbTransaction,
  expense: Pick<ExpenseRow, 'id' | 'organizationId' | 'clientId'>,
  action: AuditAction,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await recordAudit(tx, {
    organizationId: expense.organizationId,
    action,
    resourceType: 'expense',
    resourceId: expense.id,
    clientId: expense.clientId,
    metadata,
  });
}

async function ownExpense(
  tx: DbTransaction,
  organizationId: string,
  id: string,
): Promise<ExpenseRow | null> {
  const [row] = await tx
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.organizationId, organizationId)))
    .for('update');
  return row ?? null;
}

async function belongs(
  tx: DbTransaction,
  organizationId: string,
  input: { clientId?: string; subscriptionId?: string },
): Promise<boolean> {
  if (input.clientId) {
    const [client] = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, input.clientId), eq(clients.organizationId, organizationId)));
    if (!client) return false;
  }
  if (input.subscriptionId) {
    const [subscription] = await tx
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.id, input.subscriptionId),
          eq(subscriptions.organizationId, organizationId),
        ),
      );
    if (!subscription) return false;
  }
  return true;
}

/**
 * Creates or edits an expense (RF-151). A new receipt replaces the previous one; the client of an
 * expense linked to a payment request cannot change until it is unlinked.
 */
export async function saveExpense(
  claims: VerifiedClaims,
  input: ExpenseInput,
  deps: MoneyDeps,
): Promise<
  | { ok: true; id: string }
  | NotFound
  | typeof INVALID_INPUT
  | typeof INVALID_FILE
  | typeof INVALID_STATE
> {
  const actor = await moneyActor(claims, 'write', deps);
  if (!actor) return NOT_FOUND;
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const data = parsed.data;
  if (data.receiptId && !data.receiptName) return INVALID_INPUT;

  let receipt: { path: string; name: string; mimeType: string } | null = null;
  if (data.receiptId) {
    const path = receiptPath(actor.organizationId, data.receiptId);
    const verified = await verifiedReceipt(path, deps);
    if (!verified) return INVALID_FILE;
    receipt = { path, name: data.receiptName ?? 'recibo', mimeType: verified.mimeType };
  }
  const fields = {
    spentOn: data.spentOn,
    vendor: data.vendor,
    description: data.description,
    category: data.category,
    amount: data.amount,
    currency: data.currency,
    clientId: data.clientId ?? null,
    subscriptionId: data.subscriptionId ?? null,
    ...(receipt
      ? { receiptPath: receipt.path, receiptName: receipt.name, receiptMimeType: receipt.mimeType }
      : {}),
  };
  const now = (deps.now ?? (() => new Date()))();

  const result = await deps.contexts.withSystemContext(async (tx) => {
    if (!(await belongs(tx, actor.organizationId, data))) return { outcome: INVALID_INPUT };
    if (data.id) {
      const current = await ownExpense(tx, actor.organizationId, data.id);
      if (!current) return { outcome: NOT_FOUND };
      if (current.paymentRequestId && current.clientId !== fields.clientId) {
        return { outcome: INVALID_STATE };
      }
      await tx
        .update(expenses)
        .set({ ...fields, updatedAt: now })
        .where(eq(expenses.id, current.id));
      await audit(tx, { ...current, clientId: fields.clientId }, 'money.expense_updated');
      const replaced =
        receipt && current.receiptPath && current.receiptPath !== receipt.path
          ? current.receiptPath
          : null;
      return { outcome: { ok: true as const, id: current.id }, replaced };
    }
    const [created] = await tx
      .insert(expenses)
      .values({
        ...fields,
        organizationId: actor.organizationId,
        createdBy: actor.userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: expenses.id });
    if (!created) throw new Error('The expense was not created');
    await audit(
      tx,
      { id: created.id, organizationId: actor.organizationId, clientId: fields.clientId },
      'money.expense_created',
      { amount: fields.amount, currency: fields.currency },
    );
    return { outcome: { ok: true as const, id: created.id } };
  });
  if ('replaced' in result && result.replaced) await deps.storage.remove(result.replaced);
  return result.outcome;
}

/** Deletes an expense and its receipt; one linked to a payment request must be unlinked first. */
export async function deleteExpense(
  claims: VerifiedClaims,
  id: string,
  deps: MoneyDeps,
): Promise<typeof OK | NotFound | typeof INVALID_STATE> {
  const actor = await moneyActor(claims, 'write', deps);
  if (!actor || !z.uuid().safeParse(id).success) return NOT_FOUND;
  const result = await deps.contexts.withSystemContext(async (tx) => {
    const current = await ownExpense(tx, actor.organizationId, id);
    if (!current) return { outcome: NOT_FOUND };
    if (current.paymentRequestId) return { outcome: INVALID_STATE };
    await tx.delete(expenses).where(eq(expenses.id, current.id));
    await audit(tx, current, 'money.expense_deleted', {
      amount: current.amount,
      currency: current.currency,
    });
    return { outcome: OK, receiptPath: current.receiptPath };
  });
  if ('receiptPath' in result && result.receiptPath) await deps.storage.remove(result.receiptPath);
  return result.outcome;
}

/**
 * Links a billable expense to the payment request that charges it, so the client sees the original
 * receipt (RF-153); null unlinks it. Only live requests of the expense's own client qualify.
 */
export async function linkExpense(
  claims: VerifiedClaims,
  input: { expenseId: string; paymentRequestId: string | null },
  deps: MoneyDeps,
): Promise<typeof OK | NotFound | typeof INVALID_INPUT> {
  const actor = await moneyActor(claims, 'write', deps);
  if (!actor || !z.uuid().safeParse(input.expenseId).success) return NOT_FOUND;
  if (input.paymentRequestId !== null && !z.uuid().safeParse(input.paymentRequestId).success) {
    return INVALID_INPUT;
  }
  const now = (deps.now ?? (() => new Date()))();
  return deps.contexts.withSystemContext(async (tx) => {
    const current = await ownExpense(tx, actor.organizationId, input.expenseId);
    if (!current) return NOT_FOUND;
    if (input.paymentRequestId === null) {
      await tx
        .update(expenses)
        .set({ paymentRequestId: null, updatedAt: now })
        .where(eq(expenses.id, current.id));
      await audit(tx, current, 'money.expense_unlinked', {
        paymentRequestId: current.paymentRequestId,
      });
      return OK;
    }
    if (!current.clientId) return INVALID_INPUT;
    const [request] = await tx
      .select({ id: paymentRequests.id })
      .from(paymentRequests)
      .where(
        and(
          eq(paymentRequests.id, input.paymentRequestId),
          eq(paymentRequests.clientId, current.clientId),
          eq(paymentRequests.organizationId, actor.organizationId),
          ne(paymentRequests.status, 'void'),
        ),
      );
    if (!request) return INVALID_INPUT;
    await tx
      .update(expenses)
      .set({ paymentRequestId: request.id, updatedAt: now })
      .where(eq(expenses.id, current.id));
    await audit(tx, current, 'money.expense_linked', { paymentRequestId: request.id });
    return OK;
  });
}
