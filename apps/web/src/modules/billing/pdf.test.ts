import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { pdfContainsText } from '@/platform/pdf-testing';
import { buildPaymentRequestPdf, type PaymentRequestPdfInput } from './pdf';

const INPUT: PaymentRequestPdfInput = {
  locale: 'pt-PT',
  number: 'PP-2026-0001',
  label: 'Assinatura',
  amountMinor: 600000n,
  currency: 'EUR',
  sentAt: new Date('2026-10-09T10:00:00Z'),
  dueDate: '2026-10-16',
  issuer: {
    legalName: 'Aurion Creative Lda',
    taxId: '516000000',
    address: 'Av. da Liberdade, Lisboa',
    country: 'PT',
    email: 'geral@aurion.test',
    bankName: 'Banco Exemplo',
    iban: 'PT50000201231234567890154',
    bic: 'BEXAPTPL',
    paymentInstructions: 'Indique o número do pedido na transferência.',
  },
  client: {
    legalName: 'Empresa Cliente Lda',
    taxId: '509000000',
    address: 'Rua do Cliente, Porto',
  },
  payUrl: 'https://app.aurion.test/pt-PT/portal/invoices',
};

describe('buildPaymentRequestPdf', () => {
  it('pdf says non fiscal document and shows bank details', async () => {
    const pdf = await buildPaymentRequestPdf(INPUT);
    const document = await PDFDocument.load(pdf);

    expect(document.getTitle()).toBe('Pedido de pagamento PP-2026-0001');
    expect(pdfContainsText(pdf, 'Documento não fiscal')).toBe(true);
    expect(pdfContainsText(pdf, 'Empresa Cliente Lda')).toBe(true);
    expect(pdfContainsText(pdf, 'PT50000201231234567890154')).toBe(true);
    expect(pdfContainsText(pdf, 'BEXAPTPL')).toBe(true);
    expect(pdfContainsText(pdf, 'Indique o número do pedido na transferência.')).toBe(true);
    expect(pdfContainsText(pdf, '6000,00')).toBe(true);
    expect(pdfContainsText(pdf, INPUT.payUrl)).toBe(true);
  });

  it('embeds a QR code for the portal page', async () => {
    const pdf = await buildPaymentRequestPdf(INPUT);

    expect(Buffer.from(pdf).toString('latin1')).toContain('/Subtype /Image');
  });

  it('pdf renders kwanzas', async () => {
    const pdf = await buildPaymentRequestPdf({
      ...INPUT,
      amountMinor: 125000000n,
      currency: 'AOA',
      issuer: {
        ...INPUT.issuer,
        country: 'AO',
        paymentInstructions: 'Multicaixa Express: 923 000 000',
      },
    });

    expect(pdfContainsText(pdf, 'Kz')).toBe(true);
    expect(pdfContainsText(pdf, 'Multicaixa Express: 923 000 000')).toBe(true);
  });

  it('names a milestone a milestone and anything else a description', async () => {
    const milestone = await buildPaymentRequestPdf(INPUT);
    expect(pdfContainsText(milestone, 'Marco: Assinatura')).toBe(true);

    const retainer = await buildPaymentRequestPdf({
      ...INPUT,
      caption: 'description',
      label: 'Retainer Essencial · outubro de 2026',
    });
    expect(pdfContainsText(retainer, 'Descrição: Retainer Essencial')).toBe(true);
    expect(pdfContainsText(retainer, 'Marco:')).toBe(false);
  });

  it('writes english labels for english requests', async () => {
    const pdf = await buildPaymentRequestPdf({ ...INPUT, locale: 'en', currency: 'GBP' });
    const document = await PDFDocument.load(pdf);

    expect(document.getTitle()).toBe('Payment request PP-2026-0001');
    expect(pdfContainsText(pdf, 'Not a tax invoice')).toBe(true);
  });
});
