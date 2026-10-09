import { sql } from 'drizzle-orm';
import type { DbTransaction, InvoiceIssuer, PaymentRequestIssuerDetails } from '@agency-os/db';
import type { Currency } from '@agency-os/i18n';
import { daysBetween } from './domain/plan';

export type PortalBankDetails = Pick<
  PaymentRequestIssuerDetails,
  'bankName' | 'iban' | 'bic' | 'paymentInstructions'
>;

export type PortalInvoice = {
  id: string;
  number: string;
  label: string;
  amount: string;
  currency: Currency;
  dueDate: string;
  status: 'sent' | 'paid';
  sentAt: Date;
  paidAt: Date | null;
  overdueDays: number;
  pdfAvailable: boolean;
  issuerName: string;
  bank: PortalBankDetails;
  legalInvoice: { number: string; issuer: InvoiceIssuer; issuedOn: string } | null;
};

type RequestRow = {
  id: string;
  number: string;
  label: string;
  amount: string;
  currency: Currency;
  due_date: string;
  status: 'sent' | 'paid';
  sent_at: string | Date;
  paid_at: string | Date | null;
  pdf_available: boolean;
  issuer_details: PaymentRequestIssuerDetails | string;
};

type InvoiceRow = { request_id: string; number: string; issuer: InvoiceIssuer; issued_on: string };

/** P-06: the client's sent and paid payment requests, read through the portal views. */
export async function getPortalInvoices(
  tx: DbTransaction,
  clientId: string,
  today: string,
): Promise<PortalInvoice[]> {
  const requests = await tx.execute<RequestRow>(sql`
    select id, number, label, amount::text as amount, currency::text as currency,
           due_date::text as due_date, status::text as status, sent_at, paid_at, pdf_available,
           issuer_details
    from public.portal_payment_requests
    where client_id = ${clientId}::uuid
    order by sent_at desc
  `);
  if (requests.length === 0) return [];
  const invoices = await tx.execute<InvoiceRow>(sql`
    select request_id, number, issuer::text as issuer, issued_on::text as issued_on
    from public.portal_legal_invoices
    where client_id = ${clientId}::uuid
  `);

  return requests.map((row) => {
    const issuer: PaymentRequestIssuerDetails =
      typeof row.issuer_details === 'string' ? JSON.parse(row.issuer_details) : row.issuer_details;
    const invoice = invoices.find((entry) => entry.request_id === row.id);
    return {
      id: row.id,
      number: row.number,
      label: row.label,
      amount: row.amount,
      currency: row.currency,
      dueDate: row.due_date,
      status: row.status,
      sentAt: new Date(row.sent_at),
      paidAt: row.paid_at ? new Date(row.paid_at) : null,
      overdueDays: row.status === 'sent' ? Math.max(0, daysBetween(row.due_date, today)) : 0,
      pdfAvailable: row.pdf_available,
      issuerName: issuer.legalName,
      bank: {
        bankName: issuer.bankName,
        iban: issuer.iban,
        bic: issuer.bic,
        paymentInstructions: issuer.paymentInstructions,
      },
      legalInvoice: invoice
        ? { number: invoice.number, issuer: invoice.issuer, issuedOn: invoice.issued_on }
        : null,
    };
  });
}
