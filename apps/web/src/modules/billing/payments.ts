import { and, count, eq, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction, type PaymentMethod } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { toMinorUnits } from '@/modules/contracts';
import { emit, requestFlush } from '@/modules/events';
import type { VerifiedClaims } from '@/platform/db';
import { REAUTHENTICATION_REQUIRED, recentlyVerified, writesBillingRow } from './authorize';
import { lisbonDate } from './domain/plan';
import { reconcileDecision } from './domain/reconcile';
import type { BillingDeps } from './requests';

const { billingMilestones, deals, paymentRequests, payments } = schema;

/** The project stage the first payment opens (AUT-13). */
const FIRST_PAYMENT_FROM_CODE = '2.1';

type RequestRow = typeof paymentRequests.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;

type NotFound = { ok: false; rule: 'not_found' };
const NOT_FOUND: NotFound = { ok: false, rule: 'not_found' };

export type ManualPaymentMethod = Exclude<PaymentMethod, 'stripe'>;

export type RecordPaymentInput = {
  requestId: string;
  method: ManualPaymentMethod;
  amount: string;
  receivedOn: string;
  reference: string;
};

const AMOUNT_SHAPE = /^\d{1,10}(\.\d{1,2})?$/;

const manualPaymentSchema = z.object({
  requestId: z.uuid(),
  method: z.enum(['bank_transfer', 'multicaixa', 'other']),
  amount: z
    .string()
    .trim()
    .refine((value) => AMOUNT_SHAPE.test(value) && toMinorUnits(value) > 0n),
  receivedOn: z.iso.date(),
  reference: z
    .string()
    .max(120)
    .transform((value) => value.replace(/\p{Cc}+/gu, ' ').trim()),
});

/**
 * Marks a request and its milestone as paid, emits `billing.payment.received` and, when this is
 * the deal's first reconciled milestone payment while it sits at 2.1, moves the deal to 2.2.
 * Requests without a milestone (retainer months and extra requests) never move the pipeline.
 */
export async function applyReconciledPayment(
  tx: DbTransaction,
  request: RequestRow,
  payment: Pick<PaymentRow, 'id'>,
  deps: Pick<BillingDeps, 'moveDeal'>,
  now: Date,
): Promise<void> {
  await tx
    .update(paymentRequests)
    .set({ status: 'paid', paidAt: now })
    .where(eq(paymentRequests.id, request.id));
  if (request.milestoneId) {
    await tx
      .update(billingMilestones)
      .set({ status: 'paid' })
      .where(eq(billingMilestones.id, request.milestoneId));

    const [reconciled] = await tx
      .select({ total: count() })
      .from(payments)
      .innerJoin(paymentRequests, eq(paymentRequests.id, payments.requestId))
      .where(
        and(
          eq(paymentRequests.dealId, request.dealId),
          isNotNull(paymentRequests.milestoneId),
          eq(payments.status, 'reconciled'),
        ),
      );
    const [deal] = await tx
      .select({ code: deals.pipelineCode })
      .from(deals)
      .where(eq(deals.id, request.dealId));
    if (reconciled?.total === 1 && deal?.code === FIRST_PAYMENT_FROM_CODE) {
      await deps.moveDeal(tx, request.dealId);
    }
  }

  await emit(tx, {
    type: 'billing.payment.received',
    organizationId: request.organizationId,
    clientId: request.clientId,
    payload: { dealId: request.dealId, requestId: request.id, paymentId: payment.id },
  });
}

export async function emitPaymentReview(
  tx: DbTransaction,
  request: Pick<RequestRow, 'id' | 'organizationId' | 'clientId' | 'dealId'>,
  paymentId: string,
): Promise<void> {
  await emit(tx, {
    type: 'billing.payment.review',
    organizationId: request.organizationId,
    clientId: request.clientId,
    payload: { dealId: request.dealId, requestId: request.id, paymentId },
  });
}

/** Records a transfer, Multicaixa or other payment received outside the payment provider. */
export async function recordPayment(
  claims: VerifiedClaims,
  input: RecordPaymentInput,
  deps: BillingDeps,
): Promise<
  | { ok: true; status: 'reconciled' | 'review' }
  | NotFound
  | { ok: false; rule: 'invalid_input' | 'invalid_state' | 'reauthentication_required' }
> {
  const allowed = await writesBillingRow(deps.contexts, claims, {
    kind: 'request',
    id: input.requestId,
  });
  if (!allowed) return NOT_FOUND;
  if (!recentlyVerified(claims)) return REAUTHENTICATION_REQUIRED;
  const now = (deps.now ?? (() => new Date()))();
  const parsed = manualPaymentSchema.safeParse(input);
  if (!parsed.success || parsed.data.receivedOn > lisbonDate(now)) {
    return { ok: false, rule: 'invalid_input' };
  }
  const data = parsed.data;

  const result = await deps.contexts.withSystemContext(async (tx) => {
    const [request] = await tx
      .select()
      .from(paymentRequests)
      .where(eq(paymentRequests.id, data.requestId))
      .for('update');
    if (!request) return NOT_FOUND;
    if (request.status !== 'sent') return { ok: false as const, rule: 'invalid_state' as const };

    const status = reconcileDecision(request, {
      requestId: request.id,
      amountMinor: toMinorUnits(data.amount),
      currency: request.currency,
    });
    const [payment] = await tx
      .insert(payments)
      .values({
        organizationId: request.organizationId,
        clientId: request.clientId,
        requestId: request.id,
        amount: data.amount,
        currency: request.currency,
        method: data.method,
        reference: data.reference,
        receivedOn: data.receivedOn,
        status,
        recordedBy: claims.sub,
        reconciledAt: status === 'reconciled' ? now : null,
      })
      .returning({ id: payments.id });
    if (!payment) throw new Error('Payment was not recorded');
    await recordAudit(tx, {
      organizationId: request.organizationId,
      action: 'payment.recorded',
      resourceType: 'payment',
      resourceId: payment.id,
      clientId: request.clientId,
      metadata: { requestId: request.id, method: data.method, status },
    });
    if (status === 'reconciled') {
      await applyReconciledPayment(tx, request, payment, deps, now);
    } else {
      await emitPaymentReview(tx, request, payment.id);
    }
    return { ok: true as const, status };
  });

  if (result.ok) await (deps.flush ?? requestFlush)();
  return result;
}

/** Accepts a payment held for review against its still-open request. */
export async function settleReviewedPayment(
  claims: VerifiedClaims,
  input: { paymentId: string },
  deps: BillingDeps,
): Promise<
  { ok: true } | NotFound | { ok: false; rule: 'invalid_state' | 'reauthentication_required' }
> {
  const allowed = await writesBillingRow(deps.contexts, claims, {
    kind: 'payment',
    id: input.paymentId,
  });
  if (!allowed) return NOT_FOUND;
  if (!recentlyVerified(claims)) return REAUTHENTICATION_REQUIRED;
  const now = (deps.now ?? (() => new Date()))();

  const result = await deps.contexts.withSystemContext(async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, input.paymentId))
      .for('update');
    if (!payment) return NOT_FOUND;
    const [request] = await tx
      .select()
      .from(paymentRequests)
      .where(eq(paymentRequests.id, payment.requestId))
      .for('update');
    if (!request || payment.status !== 'review' || request.status !== 'sent') {
      return { ok: false as const, rule: 'invalid_state' as const };
    }
    await tx
      .update(payments)
      .set({ status: 'reconciled', reconciledAt: now })
      .where(eq(payments.id, payment.id));
    await recordAudit(tx, {
      organizationId: payment.organizationId,
      action: 'payment.settled',
      resourceType: 'payment',
      resourceId: payment.id,
      clientId: payment.clientId,
      metadata: { requestId: request.id, settledBy: claims.sub },
    });
    await applyReconciledPayment(tx, request, payment, deps, now);
    return { ok: true as const };
  });

  if (result.ok) await (deps.flush ?? requestFlush)();
  return result;
}
