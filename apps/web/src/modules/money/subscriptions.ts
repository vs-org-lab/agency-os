import { and, eq } from 'drizzle-orm';
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
import { nextRenewal } from './domain/cycles';
import { CURRENCIES } from './domain/summary';
import { isoDate, moneyAmount } from './expenses';
import { receiptIdSchema, receiptPath, verifiedReceipt } from './receipts';

const { expenses, subscriptions } = schema;

const subscriptionSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(80),
  vendor: z.string().trim().max(120).default(''),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: moneyAmount,
  currency: z.enum(CURRENCIES),
  cycle: z.enum(['monthly', 'annual']),
  nextRenewalOn: isoDate,
});

/** What a form sends; every field is checked against the schema before use. */
export type SubscriptionInput = {
  id?: string;
  name: string;
  vendor?: string;
  category: string;
  amount: string;
  currency: string;
  cycle: string;
  nextRenewalOn: string;
};

type SubscriptionRow = typeof subscriptions.$inferSelect;

async function audit(
  tx: DbTransaction,
  subscription: Pick<SubscriptionRow, 'id' | 'organizationId'>,
  action: AuditAction,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await recordAudit(tx, {
    organizationId: subscription.organizationId,
    action,
    resourceType: 'subscription',
    resourceId: subscription.id,
    metadata,
  });
}

async function ownSubscription(
  tx: DbTransaction,
  organizationId: string,
  id: string,
): Promise<SubscriptionRow | null> {
  const [row] = await tx
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.organizationId, organizationId)))
    .for('update');
  return row ?? null;
}

const nowOf = (deps: MoneyDeps) => (deps.now ?? (() => new Date()))();

/** Creates or edits a subscription with its renewal date (RF-151). */
export async function saveSubscription(
  claims: VerifiedClaims,
  input: SubscriptionInput,
  deps: MoneyDeps,
): Promise<{ ok: true; id: string } | NotFound | typeof INVALID_INPUT> {
  const actor = await moneyActor(claims, 'write', deps);
  if (!actor) return NOT_FOUND;
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const { id, ...fields } = parsed.data;
  const now = nowOf(deps);
  return deps.contexts.withSystemContext(async (tx) => {
    if (id) {
      const current = await ownSubscription(tx, actor.organizationId, id);
      if (!current) return NOT_FOUND;
      await tx
        .update(subscriptions)
        .set({ ...fields, updatedAt: now })
        .where(eq(subscriptions.id, current.id));
      await audit(tx, current, 'money.subscription_updated');
      return { ok: true as const, id: current.id };
    }
    const [created] = await tx
      .insert(subscriptions)
      .values({
        ...fields,
        organizationId: actor.organizationId,
        createdBy: actor.userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: subscriptions.id });
    if (!created) throw new Error('The subscription was not created');
    await audit(
      tx,
      { id: created.id, organizationId: actor.organizationId },
      'money.subscription_created',
    );
    return { ok: true as const, id: created.id };
  });
}

export async function cancelSubscription(
  claims: VerifiedClaims,
  id: string,
  deps: MoneyDeps,
): Promise<typeof OK | NotFound> {
  const actor = await moneyActor(claims, 'write', deps);
  if (!actor || !z.uuid().safeParse(id).success) return NOT_FOUND;
  return deps.contexts.withSystemContext(async (tx) => {
    const current = await ownSubscription(tx, actor.organizationId, id);
    if (!current) return NOT_FOUND;
    await tx
      .update(subscriptions)
      .set({ status: 'cancelled', updatedAt: nowOf(deps) })
      .where(eq(subscriptions.id, current.id));
    await audit(tx, current, 'money.subscription_cancelled');
    return OK;
  });
}

/**
 * Records a renewal: the expense of this cycle, with its receipt when there is one, and the next
 * renewal date one cycle later. Cancelled subscriptions do not renew.
 */
export async function renewSubscription(
  claims: VerifiedClaims,
  input: { id: string; receiptId?: string; receiptName?: string },
  deps: MoneyDeps,
): Promise<
  | { ok: true; expenseId: string }
  | NotFound
  | typeof INVALID_INPUT
  | typeof INVALID_FILE
  | typeof INVALID_STATE
> {
  const actor = await moneyActor(claims, 'write', deps);
  if (!actor || !z.uuid().safeParse(input.id).success) return NOT_FOUND;
  if (
    input.receiptId &&
    (!receiptIdSchema.safeParse(input.receiptId).success || !input.receiptName)
  ) {
    return INVALID_INPUT;
  }
  let receipt: { path: string; name: string; mimeType: string } | null = null;
  if (input.receiptId) {
    const path = receiptPath(actor.organizationId, input.receiptId);
    const verified = await verifiedReceipt(path, deps);
    if (!verified) return INVALID_FILE;
    receipt = { path, name: input.receiptName ?? 'recibo', mimeType: verified.mimeType };
  }
  const now = nowOf(deps);
  return deps.contexts.withSystemContext(async (tx) => {
    const current = await ownSubscription(tx, actor.organizationId, input.id);
    if (!current) return NOT_FOUND;
    if (current.status !== 'active') return INVALID_STATE;
    const [expense] = await tx
      .insert(expenses)
      .values({
        organizationId: actor.organizationId,
        spentOn: current.nextRenewalOn,
        vendor: current.vendor || current.name,
        description: current.name,
        category: current.category,
        amount: current.amount,
        currency: current.currency,
        subscriptionId: current.id,
        receiptPath: receipt?.path ?? null,
        receiptName: receipt?.name ?? null,
        receiptMimeType: receipt?.mimeType ?? null,
        createdBy: actor.userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: expenses.id });
    if (!expense) throw new Error('The renewal expense was not created');
    const next = nextRenewal(current.nextRenewalOn, current.cycle);
    await tx
      .update(subscriptions)
      .set({ nextRenewalOn: next, updatedAt: now })
      .where(eq(subscriptions.id, current.id));
    await recordAudit(tx, {
      organizationId: actor.organizationId,
      action: 'money.expense_created',
      resourceType: 'expense',
      resourceId: expense.id,
      metadata: { amount: current.amount, currency: current.currency },
    });
    await audit(tx, current, 'money.subscription_renewed', {
      renewedOn: current.nextRenewalOn,
      next,
    });
    return { ok: true as const, expenseId: expense.id };
  });
}
