import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  schema,
  type DbTransaction,
  type PaymentRequestClientDetails,
  type PaymentRequestIssuerDetails,
} from '@agency-os/db';
import type { Currency, Locale } from '@agency-os/i18n';
import { withActor } from '@/modules/access';
import { recordAudit } from '@/modules/audit';
import { toMinorUnits } from '@/modules/contracts';
import { emit, requestFlush } from '@/modules/events';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { canWriteBilling } from './access';
import { formatRequestNumber } from './domain/numbering';
import { buildMilestones, dueDateFrom, lisbonDate } from './domain/plan';
import { buildPaymentRequestPdf } from './pdf';
import { requestPdfPath, type BillingStorage } from './storage';

const {
  billingCounters,
  billingMilestones,
  contracts,
  legalEntities,
  paymentRequests,
  proposalOptions,
  proposals,
} = schema;

/** Days a client has to pay a request (spec 1D, section 4). */
export const REQUEST_DUE_DAYS = 7;

const CHASE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type BillingDeps = {
  contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'>;
  storage: BillingStorage;
  appBaseUrl: string;
  /** Moves the deal from 2.1 to 2.2 inside the transaction that records the first payment. */
  moveDeal: (tx: DbTransaction, dealId: string) => Promise<void>;
  flush?: () => Promise<void>;
  now?: () => Date;
};

type NotFound = { ok: false; rule: 'not_found' };

const NOT_FOUND: NotFound = { ok: false, rule: 'not_found' };

type MilestoneRow = typeof billingMilestones.$inferSelect;

export function portalInvoicesUrl(appBaseUrl: string, locale: Locale): string {
  return new URL(`/${locale}/portal/invoices`, appBaseUrl).toString();
}

export async function nextRequestNumber(
  tx: DbTransaction,
  organizationId: string,
  year: number,
): Promise<string> {
  const [counter] = await tx
    .insert(billingCounters)
    .values({ organizationId, year, lastNumber: 1 })
    .onConflictDoUpdate({
      target: [billingCounters.organizationId, billingCounters.year],
      set: { lastNumber: sql`${billingCounters.lastNumber} + 1` },
    })
    .returning({ lastNumber: billingCounters.lastNumber });
  if (!counter) throw new Error('Payment request number was not allocated');
  return formatRequestNumber(year, counter.lastNumber);
}

async function requestParties(
  tx: DbTransaction,
  contractId: string,
): Promise<{
  locale: Locale;
  issuer: PaymentRequestIssuerDetails;
  client: PaymentRequestClientDetails;
} | null> {
  const [row] = await tx
    .select({
      locale: contracts.locale,
      studio: contracts.studioDetails,
      bankName: legalEntities.bankName,
      iban: legalEntities.iban,
      bic: legalEntities.bic,
      paymentInstructions: legalEntities.paymentInstructions,
      clientDetails: proposals.clientDetails,
    })
    .from(contracts)
    .innerJoin(legalEntities, eq(legalEntities.id, contracts.legalEntityId))
    .innerJoin(proposals, eq(proposals.id, contracts.proposalId))
    .where(eq(contracts.id, contractId));
  if (!row?.clientDetails) return null;
  return {
    locale: row.locale,
    issuer: {
      legalName: row.studio.legalName,
      taxId: row.studio.taxId,
      address: row.studio.address,
      country: row.studio.country,
      email: row.studio.email,
      bankName: row.bankName,
      iban: row.iban,
      bic: row.bic,
      paymentInstructions: row.paymentInstructions,
    },
    client: {
      legalName: row.clientDetails.legalName,
      taxId: row.clientDetails.taxId,
      address: row.clientDetails.address,
    },
  };
}

/**
 * Issues the payment request of one milestone: allocates the next number, freezes both parties
 * and the bank details, stores the PDF and emits `billing.request.sent`.
 */
async function issueRequest(
  tx: DbTransaction,
  milestone: MilestoneRow,
  deps: BillingDeps,
  now: Date,
): Promise<string> {
  const parties = await requestParties(tx, milestone.contractId);
  if (!parties) throw new Error('Payment request parties were not found');
  const number = await nextRequestNumber(
    tx,
    milestone.organizationId,
    Number(lisbonDate(now).slice(0, 4)),
  );
  const dueDate = dueDateFrom(now, REQUEST_DUE_DAYS);

  const [request] = await tx
    .insert(paymentRequests)
    .values({
      organizationId: milestone.organizationId,
      clientId: milestone.clientId,
      dealId: milestone.dealId,
      milestoneId: milestone.id,
      number,
      label: milestone.label,
      amount: milestone.amount,
      currency: milestone.currency,
      locale: parties.locale,
      dueDate,
      issuerDetails: parties.issuer,
      clientDetails: parties.client,
      sentAt: now,
    })
    .returning({ id: paymentRequests.id });
  if (!request) throw new Error('Payment request was not created');

  const pdf = await buildPaymentRequestPdf({
    locale: parties.locale,
    number,
    label: milestone.label,
    amountMinor: toMinorUnits(milestone.amount),
    currency: milestone.currency as Currency,
    sentAt: now,
    dueDate,
    issuer: parties.issuer,
    client: parties.client,
    payUrl: portalInvoicesUrl(deps.appBaseUrl, parties.locale),
  });
  const path = requestPdfPath(milestone.organizationId, milestone.clientId, request.id);
  await deps.storage.upload(path, pdf);

  await tx.update(paymentRequests).set({ pdfPath: path }).where(eq(paymentRequests.id, request.id));
  await tx
    .update(billingMilestones)
    .set({ status: 'requested' })
    .where(eq(billingMilestones.id, milestone.id));
  await recordAudit(tx, {
    organizationId: milestone.organizationId,
    action: 'payment_request.sent',
    resourceType: 'payment_request',
    resourceId: request.id,
    clientId: milestone.clientId,
    metadata: { number, milestoneId: milestone.id, dealId: milestone.dealId },
  });
  await emit(tx, {
    type: 'billing.request.sent',
    organizationId: milestone.organizationId,
    clientId: milestone.clientId,
    payload: { dealId: milestone.dealId, requestId: request.id },
  });
  return request.id;
}

/**
 * Creates the milestones of a signed contract from the accepted option and issues the first
 * request (AUT-12). Runs once per contract: a repeated call finds the milestones and stops.
 */
export async function createPlanForContract(
  contractId: string,
  deps: BillingDeps,
): Promise<{ created: boolean; requestId: string | null }> {
  const skipped = { created: false, requestId: null };
  if (!z.uuid().safeParse(contractId).success) return skipped;
  const now = (deps.now ?? (() => new Date()))();

  const result = await deps.contexts.withSystemContext(async (tx) => {
    const [contract] = await tx
      .select({
        id: contracts.id,
        organizationId: contracts.organizationId,
        clientId: contracts.clientId,
        dealId: contracts.dealId,
        status: contracts.status,
        optionId: contracts.optionId,
        currency: proposals.currency,
      })
      .from(contracts)
      .innerJoin(proposals, eq(proposals.id, contracts.proposalId))
      .where(eq(contracts.id, contractId))
      .for('update', { of: contracts });
    if (contract?.status !== 'signed') return skipped;

    const [existing] = await tx
      .select({ id: billingMilestones.id })
      .from(billingMilestones)
      .where(eq(billingMilestones.contractId, contract.id))
      .limit(1);
    if (existing) return skipped;

    const [option] = await tx
      .select({ amount: proposalOptions.oneOffAmount, plan: proposalOptions.paymentPlan })
      .from(proposalOptions)
      .where(eq(proposalOptions.id, contract.optionId));
    if (!option) return skipped;

    const milestones = await tx
      .insert(billingMilestones)
      .values(
        buildMilestones(option.amount, option.plan).map((draft) => ({
          ...draft,
          organizationId: contract.organizationId,
          clientId: contract.clientId,
          dealId: contract.dealId,
          contractId: contract.id,
          currency: contract.currency,
        })),
      )
      .returning();
    const first = milestones.find((milestone) => milestone.position === 1);
    if (!first) return skipped;
    return { created: true, requestId: await issueRequest(tx, first, deps, now) };
  });

  if (result.created) await (deps.flush ?? requestFlush)();
  return result;
}

async function writerFor(
  deps: BillingDeps,
  claims: VerifiedClaims,
  check: (tx: DbTransaction) => Promise<boolean>,
): Promise<boolean> {
  return withActor(
    deps.contexts,
    claims,
    async (tx, actor) => canWriteBilling(actor) && (await check(tx)),
    false,
  );
}

export async function requestPayment(
  claims: VerifiedClaims,
  input: { milestoneId: string },
  deps: BillingDeps,
): Promise<{ ok: true; requestId: string } | NotFound | { ok: false; rule: 'invalid_state' }> {
  if (!z.uuid().safeParse(input.milestoneId).success) return NOT_FOUND;
  const allowed = await writerFor(deps, claims, async (tx) => {
    const rows = await tx
      .select({ id: billingMilestones.id })
      .from(billingMilestones)
      .where(eq(billingMilestones.id, input.milestoneId));
    return rows.length > 0;
  });
  if (!allowed) return NOT_FOUND;
  const now = (deps.now ?? (() => new Date()))();

  const result = await deps.contexts.withSystemContext(async (tx) => {
    const [milestone] = await tx
      .select()
      .from(billingMilestones)
      .where(eq(billingMilestones.id, input.milestoneId))
      .for('update');
    if (!milestone) return NOT_FOUND;
    if (milestone.status !== 'pending')
      return { ok: false as const, rule: 'invalid_state' as const };
    return { ok: true as const, requestId: await issueRequest(tx, milestone, deps, now) };
  });

  if (result.ok) await (deps.flush ?? requestFlush)();
  return result;
}

async function writableRequest(
  deps: BillingDeps,
  claims: VerifiedClaims,
  requestId: string,
): Promise<boolean> {
  if (!z.uuid().safeParse(requestId).success) return false;
  return writerFor(deps, claims, async (tx) => {
    const rows = await tx
      .select({ id: paymentRequests.id })
      .from(paymentRequests)
      .where(eq(paymentRequests.id, requestId));
    return rows.length > 0;
  });
}

/** Voids an unpaid request; a paid one is corrected by a credit note in certified software (RN-31). */
export async function voidPaymentRequest(
  claims: VerifiedClaims,
  input: { requestId: string; reason: string },
  deps: BillingDeps,
): Promise<{ ok: true } | NotFound | { ok: false; rule: 'invalid_input' | 'invalid_state' }> {
  const reason = input.reason.trim();
  if (!(await writableRequest(deps, claims, input.requestId))) return NOT_FOUND;
  if (reason.length === 0 || reason.length > 500) return { ok: false, rule: 'invalid_input' };
  const now = (deps.now ?? (() => new Date()))();

  return deps.contexts.withSystemContext(async (tx) => {
    const [request] = await tx
      .select()
      .from(paymentRequests)
      .where(eq(paymentRequests.id, input.requestId))
      .for('update');
    if (!request) return NOT_FOUND;
    if (request.status !== 'sent') return { ok: false as const, rule: 'invalid_state' as const };
    await tx
      .update(paymentRequests)
      .set({ status: 'void', voidedAt: now, voidReason: reason })
      .where(eq(paymentRequests.id, request.id));
    await tx
      .update(billingMilestones)
      .set({ status: 'pending' })
      .where(
        and(
          eq(billingMilestones.id, request.milestoneId),
          eq(billingMilestones.status, 'requested'),
        ),
      );
    await recordAudit(tx, {
      organizationId: request.organizationId,
      action: 'payment_request.voided',
      resourceType: 'payment_request',
      resourceId: request.id,
      clientId: request.clientId,
      metadata: { number: request.number, reason },
    });
    return { ok: true as const };
  });
}

/** "Cobrar": sends the client a reminder now, at most once every 24 hours (RF-045). */
export async function chasePaymentRequest(
  claims: VerifiedClaims,
  input: { requestId: string },
  deps: BillingDeps,
): Promise<{ ok: true } | NotFound | { ok: false; rule: 'invalid_state' | 'too_soon' }> {
  if (!(await writableRequest(deps, claims, input.requestId))) return NOT_FOUND;
  const now = (deps.now ?? (() => new Date()))();

  const result = await deps.contexts.withSystemContext(async (tx) => {
    const [request] = await tx
      .select()
      .from(paymentRequests)
      .where(eq(paymentRequests.id, input.requestId))
      .for('update');
    if (!request) return NOT_FOUND;
    if (request.status !== 'sent') return { ok: false as const, rule: 'invalid_state' as const };
    if (
      request.lastChasedAt &&
      now.getTime() - request.lastChasedAt.getTime() < CHASE_INTERVAL_MS
    ) {
      return { ok: false as const, rule: 'too_soon' as const };
    }
    await tx
      .update(paymentRequests)
      .set({ lastChasedAt: now })
      .where(eq(paymentRequests.id, request.id));
    await recordAudit(tx, {
      organizationId: request.organizationId,
      action: 'payment_request.chased',
      resourceType: 'payment_request',
      resourceId: request.id,
      clientId: request.clientId,
      metadata: { number: request.number },
    });
    await emit(tx, {
      type:
        lisbonDate(now) > request.dueDate ? 'billing.request.overdue' : 'billing.request.reminded',
      organizationId: request.organizationId,
      clientId: request.clientId,
      payload: { dealId: request.dealId, requestId: request.id },
    });
    return { ok: true as const };
  });

  if (result.ok) await (deps.flush ?? requestFlush)();
  return result;
}
