import QRCode from 'qrcode';
import type { PaymentRequestClientDetails, PaymentRequestIssuerDetails } from '@agency-os/db';
import { formatMoney, type Currency, type Locale } from '@agency-os/i18n';
import { BODY_SIZE, createPdf, numberPages } from '@/platform/pdf';
import { BILLING_TIME_ZONE } from './domain/plan';

export type PaymentRequestPdfInput = {
  locale: Locale;
  number: string;
  label: string;
  amountMinor: bigint;
  currency: Currency;
  sentAt: Date;
  dueDate: string;
  issuer: PaymentRequestIssuerDetails;
  client: PaymentRequestClientDetails;
  payUrl: string;
};

type Labels = {
  title: string;
  notFiscal: string;
  taxId: string;
  billedTo: string;
  milestone: string;
  amount: string;
  issuedOn: string;
  dueOn: string;
  payment: string;
  bank: string;
  iban: string;
  bic: string;
  reference: string;
  portal: string;
  page: string;
};

const LABELS: Record<Locale, Labels> = {
  'pt-PT': {
    title: 'Pedido de pagamento',
    notFiscal:
      'Documento não fiscal. A fatura é emitida em software certificado depois do pagamento.',
    taxId: 'NIF',
    billedTo: 'Cliente',
    milestone: 'Prestação',
    amount: 'Valor',
    issuedOn: 'Data',
    dueOn: 'Vencimento',
    payment: 'Como pagar',
    bank: 'Banco',
    iban: 'IBAN',
    bic: 'BIC/SWIFT',
    reference: 'Referência a indicar',
    portal: 'Pagar ou consultar no portal',
    page: 'Página {page} de {pages}',
  },
  en: {
    title: 'Payment request',
    notFiscal: 'Not a tax invoice. The invoice is issued by certified software once paid.',
    taxId: 'Tax ID',
    billedTo: 'Billed to',
    milestone: 'Milestone',
    amount: 'Amount',
    issuedOn: 'Date',
    dueOn: 'Due',
    payment: 'How to pay',
    bank: 'Bank',
    iban: 'IBAN',
    bic: 'BIC/SWIFT',
    reference: 'Reference to quote',
    portal: 'Pay or review in the portal',
    page: 'Page {page} of {pages}',
  },
};

const QR_SIZE = 96;

function longDate(value: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: BILLING_TIME_ZONE }).format(
    value,
  );
}

/** Renders a branded, non-fiscal payment request with the bank details and a QR code to the portal. */
export async function buildPaymentRequestPdf(input: PaymentRequestPdfInput): Promise<Uint8Array> {
  const labels = LABELS[input.locale];
  const title = `${labels.title} ${input.number}`;
  const { document, fonts, writer } = await createPdf({ title });

  writer.paragraph(title, { size: 16, bold: true });
  writer.paragraph(labels.notFiscal, { muted: true });
  writer.space(12);

  writer.paragraph(input.issuer.legalName, { size: 12, bold: true });
  writer.paragraph(`${labels.taxId}: ${input.issuer.taxId}`);
  writer.paragraph(input.issuer.address);
  writer.paragraph(input.issuer.email);
  writer.space(10);

  writer.paragraph(labels.billedTo, { bold: true });
  writer.paragraph(input.client.legalName);
  writer.paragraph(`${labels.taxId}: ${input.client.taxId}`);
  writer.paragraph(input.client.address);
  writer.space(10);

  writer.paragraph(`${labels.milestone}: ${input.label}`);
  writer.paragraph(
    `${labels.amount}: ${formatMoney(input.amountMinor, input.currency, input.locale)}`,
    { size: 12, bold: true },
  );
  writer.paragraph(`${labels.issuedOn}: ${longDate(input.sentAt, input.locale)}`);
  writer.paragraph(
    `${labels.dueOn}: ${longDate(new Date(`${input.dueDate}T12:00:00Z`), input.locale)}`,
  );
  writer.space(12);

  writer.paragraph(labels.payment, { size: 12, bold: true });
  if (input.issuer.bankName) writer.paragraph(`${labels.bank}: ${input.issuer.bankName}`);
  if (input.issuer.iban) writer.paragraph(`${labels.iban}: ${input.issuer.iban}`);
  if (input.issuer.bic) writer.paragraph(`${labels.bic}: ${input.issuer.bic}`);
  for (const line of input.issuer.paymentInstructions.split('\n')) {
    if (line.trim()) writer.paragraph(line.trim());
  }
  writer.paragraph(`${labels.reference}: ${input.number}`, { bold: true });
  writer.space(BODY_SIZE);

  writer.paragraph(labels.portal, { bold: true });
  writer.paragraph(input.payUrl, { muted: true });
  writer.space(4);
  const qr = await QRCode.toBuffer(input.payUrl, { type: 'png', margin: 1, width: QR_SIZE * 3 });
  await writer.image(new Uint8Array(qr), QR_SIZE);

  numberPages(document, fonts, labels.page);
  return document.save();
}
