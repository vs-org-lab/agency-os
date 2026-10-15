// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { PortalInvoice } from '@/modules/billing';
import { InvoiceCard, type PayAction } from './invoice-card';

afterEach(() => {
  cleanup();
});

const OPEN: PortalInvoice = {
  id: '6f1c2c43-46d4-4d55-9a3e-6c0f9b1d0a11',
  number: 'PP-2026-0001',
  label: 'Assinatura',
  amount: '6000.00',
  currency: 'EUR',
  dueDate: '2026-10-16',
  status: 'sent',
  sentAt: new Date('2026-10-09T10:00:00Z'),
  paidAt: null,
  overdueDays: 0,
  pdfAvailable: true,
  issuerName: 'Aurion Creative Lda',
  bank: {
    bankName: 'Banco Exemplo',
    iban: 'PT50000201231234567890154',
    bic: 'BEXAPTPL',
    paymentInstructions: 'Multicaixa Express: 923 000 000',
  },
  legalInvoice: null,
  receipts: [],
};

function renderCard(invoice: PortalInvoice, cardEnabled: boolean, pay: PayAction = vi.fn()) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <InvoiceCard invoice={invoice} cardEnabled={cardEnabled} pay={pay} />
    </NextIntlClientProvider>,
  );
}

describe('InvoiceCard', () => {
  it('the invoice card lists receipts', () => {
    renderCard(
      {
        ...OPEN,
        receipts: [
          { expenseId: 'expense-1', name: 'recibo-grafica.png' },
          { expenseId: 'expense-2', name: 'bilhete.pdf' },
        ],
      },
      false,
    );
    const receipts = screen.getByRole('list', { name: 'Comprovativos' });
    expect(
      within(receipts)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['recibo-grafica.png', '/api/money/receipts/expense-1'],
      ['bilhete.pdf', '/api/money/receipts/expense-2'],
    ]);
  });

  it('shows no receipts list without receipts', () => {
    renderCard(OPEN, false);
    expect(screen.queryByRole('list', { name: 'Comprovativos' })).toBeNull();
  });

  it('shows an open request with bank details, the reference and the pdf', () => {
    renderCard(OPEN, true);

    expect(screen.getByText('Por pagar')).toBeDefined();
    expect(screen.getByText('PT50000201231234567890154')).toBeDefined();
    expect(screen.getByText('Multicaixa Express: 923 000 000')).toBeDefined();
    expect(screen.getByText('Indique a referência PP-2026-0001 no pagamento.')).toBeDefined();
    expect(
      screen
        .getByRole('link', { name: 'Descarregar o pedido PP-2026-0001 (PDF)' })
        .getAttribute('href'),
    ).toBe(`/api/billing/request/${OPEN.id}`);
    expect(screen.getByRole('button', { name: 'Pagar com cartão' })).toBeDefined();
  });

  it('hides card payment for kwanza and when cards are off', () => {
    renderCard({ ...OPEN, currency: 'AOA', amount: '1250000.00' }, true);
    expect(screen.queryByRole('button', { name: 'Pagar com cartão' })).toBeNull();
    cleanup();

    renderCard(OPEN, false);
    expect(screen.queryByRole('button', { name: 'Pagar com cartão' })).toBeNull();
  });

  it('opens checkout and reports when it is unavailable', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const pay = vi
      .fn<PayAction>()
      .mockResolvedValueOnce({ ok: true, url: 'https://checkout.stripe.test/c/1' })
      .mockResolvedValueOnce({ ok: false, code: 'unavailable' });
    renderCard(OPEN, true, pay);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pagar com cartão' }));
    });
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.test/c/1');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pagar com cartão' }));
    });
    expect(screen.getByRole('alert').textContent).toBe(
      'O pagamento com cartão não está disponível para este pedido.',
    );
    vi.unstubAllGlobals();
  });

  it('shows the legal invoice of a paid request instead of payment details', () => {
    renderCard(
      {
        ...OPEN,
        status: 'paid',
        paidAt: new Date('2026-10-12T10:00:00Z'),
        legalInvoice: { number: 'FR 2026/14', issuer: 'at_certified', issuedOn: '2026-10-12' },
      },
      true,
    );

    expect(screen.getByText('Pago')).toBeDefined();
    expect(
      screen
        .getByRole('link', { name: 'Descarregar a fatura FR 2026/14 (PDF)' })
        .getAttribute('href'),
    ).toBe(`/api/billing/invoice/${OPEN.id}`);
    expect(screen.queryByText('PT50000201231234567890154')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pagar com cartão' })).toBeNull();
  });
});
