import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  schema,
  type BillingMilestoneStatus,
  type DbTransaction,
  type InvoiceIssuer,
  type PaymentMethod,
  type PaymentRequestStatus,
  type PaymentStatus,
} from '@agency-os/db';
import type { Currency } from '@agency-os/i18n';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { daysBetween } from './domain/plan';
import { BILLING_URL_TTL_SECONDS, type BillingStorage } from './storage';

const { billingMilestones, legalInvoices, paymentRequests, payments } = schema;

export type PaymentView = {
  id: string;
  amount: string;
  currency: string;
  method: PaymentMethod;
  reference: string;
  receivedOn: string;
  status: PaymentStatus;
};

export type LegalInvoiceView = { number: string; issuer: InvoiceIssuer; issuedOn: string };

export type PaymentRequestView = {
  id: string;
  number: string;
  amount: string;
  currency: Currency;
  dueDate: string;
  status: PaymentRequestStatus;
  sentAt: Date;
  paidAt: Date | null;
  lastChasedAt: Date | null;
  /** Whole days past the due date while unpaid; 0 otherwise. */
  overdueDays: number;
  pdfAvailable: boolean;
  payments: PaymentView[];
  legalInvoice: LegalInvoiceView | null;
};

export type MilestoneView = {
  id: string;
  position: number;
  label: string;
  percent: number;
  amount: string;
  currency: Currency;
  status: BillingMilestoneStatus;
  request: PaymentRequestView | null;
};

export type DealBilling = { milestones: MilestoneView[] };

/** The deal's payment plan as the caller may read it (row level security), or null without one. */
export async function getDealBilling(
  tx: DbTransaction,
  dealId: string,
  today: string,
): Promise<DealBilling | null> {
  const milestones = await tx
    .select()
    .from(billingMilestones)
    .where(eq(billingMilestones.dealId, dealId))
    .orderBy(asc(billingMilestones.position));
  if (milestones.length === 0) return null;

  const requests = await tx
    .select()
    .from(paymentRequests)
    .where(and(eq(paymentRequests.dealId, dealId), ne(paymentRequests.status, 'void')))
    .orderBy(desc(paymentRequests.sentAt));
  const requestIds = requests.map((request) => request.id);
  const paymentRows = requestIds.length
    ? await tx
        .select()
        .from(payments)
        .where(inArray(payments.requestId, requestIds))
        .orderBy(asc(payments.createdAt))
    : [];
  const invoiceRows = requestIds.length
    ? await tx.select().from(legalInvoices).where(inArray(legalInvoices.requestId, requestIds))
    : [];

  const requestView = (request: (typeof requests)[number]): PaymentRequestView => {
    const invoice = invoiceRows.find((row) => row.requestId === request.id);
    return {
      id: request.id,
      number: request.number,
      amount: request.amount,
      currency: request.currency,
      dueDate: request.dueDate,
      status: request.status,
      sentAt: request.sentAt,
      paidAt: request.paidAt,
      lastChasedAt: request.lastChasedAt,
      overdueDays: request.status === 'sent' ? Math.max(0, daysBetween(request.dueDate, today)) : 0,
      pdfAvailable: request.pdfPath !== null,
      payments: paymentRows
        .filter((payment) => payment.requestId === request.id)
        .map((payment) => ({
          id: payment.id,
          amount: payment.amount,
          currency: payment.currency,
          method: payment.method,
          reference: payment.reference,
          receivedOn: payment.receivedOn,
          status: payment.status,
        })),
      legalInvoice: invoice
        ? { number: invoice.number, issuer: invoice.issuer, issuedOn: invoice.issuedOn }
        : null,
    };
  };

  return {
    milestones: milestones.map((milestone) => {
      const request = requests.find((row) => row.milestoneId === milestone.id);
      return {
        id: milestone.id,
        position: milestone.position,
        label: milestone.label,
        percent: milestone.percent,
        amount: milestone.amount,
        currency: milestone.currency,
        status: milestone.status,
        request: request ? requestView(request) : null,
      };
    }),
  };
}

export type BillingPdfKind = 'request' | 'invoice';

/**
 * A short-lived link to a payment request PDF or its legal invoice, for staff who read billing or
 * for the client's decision maker and finance contacts through the portal views.
 */
export async function billingPdfUrl(
  claims: VerifiedClaims,
  input: { kind: BillingPdfKind; id: string },
  deps: {
    contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'>;
    storage: BillingStorage;
  },
): Promise<string | null> {
  if (!z.uuid().safeParse(input.id).success) return null;
  const visible = await deps.contexts.withUserContext(claims, async (tx) => {
    const staff = await tx
      .select({ id: paymentRequests.id })
      .from(paymentRequests)
      .where(eq(paymentRequests.id, input.id));
    if (staff.length > 0) return true;
    const portal = await tx.execute<{ id: string }>(sql`
      select id from public.portal_payment_requests where id = ${input.id}::uuid
    `);
    return portal.length > 0;
  });
  if (!visible) return null;

  const [file] = await deps.contexts.withSystemContext((tx) =>
    input.kind === 'request'
      ? tx
          .select({ path: paymentRequests.pdfPath })
          .from(paymentRequests)
          .where(eq(paymentRequests.id, input.id))
      : tx
          .select({ path: legalInvoices.pdfPath })
          .from(legalInvoices)
          .where(eq(legalInvoices.requestId, input.id)),
  );
  if (!file?.path) return null;
  return deps.storage.signedUrl(file.path, BILLING_URL_TTL_SECONDS);
}

/** True when the deal has a fully signed contract the caller can read. */
export async function hasSignedContract(tx: DbTransaction, dealId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: schema.contracts.id })
    .from(schema.contracts)
    .where(and(eq(schema.contracts.dealId, dealId), eq(schema.contracts.status, 'signed')))
    .limit(1);
  return rows.length > 0;
}
