// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { MoneyRequestRow } from '@/modules/money';
import { MoneyBreakdown } from './money-breakdown';

afterEach(() => {
  cleanup();
});

const row = (overrides: Partial<MoneyRequestRow>): MoneyRequestRow => ({
  id: crypto.randomUUID(),
  clientName: 'Bloom',
  number: 'PP-2026-0001',
  label: 'Assinatura',
  amount: '1000.00',
  currency: 'EUR',
  status: 'sent',
  sentAt: '2026-10-20T10:00:00.000Z',
  legalInvoiceNumber: null,
  ...overrides,
});

describe('MoneyBreakdown', () => {
  it('shows open requests by age and what each client paid', () => {
    render(
      <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
        <MoneyBreakdown
          today="2026-10-27"
          requests={[
            row({}),
            row({ sentAt: '2026-06-01T10:00:00.000Z', amount: '250.00' }),
            row({ status: 'paid', clientName: 'Norte', amount: '4000.00' }),
          ]}
        />
      </NextIntlClientProvider>,
    );

    const ages = screen.getByRole('region', { name: 'Pedidos em aberto por idade' });
    const current = within(ages).getByText('Até 30 dias').closest('li');
    expect(current?.textContent).toContain('1 pedido');
    expect(within(ages).getByText('Mais de 90 dias').closest('li')?.textContent).toContain(
      '1 pedido',
    );

    const clients = screen.getByRole('region', { name: 'Recebido por cliente' });
    expect(within(clients).getByText('Norte')).toBeTruthy();
    expect(within(clients).queryByText('Bloom')).toBeNull();
  });
});
