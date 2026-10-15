// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { RequestActions } from '@/components/billing/request-block';
import type { RetainerBillingView, RetainerRequestView } from '@/modules/retainers';
import { RetainerBilling } from './retainer-billing';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
});

function request(overrides: Partial<RetainerRequestView>): RetainerRequestView {
  return {
    id: '6f1c2c43-46d4-4d55-9a3e-6c0f9b1d0a11',
    number: 'PP-2026-0001',
    amount: '1500.00',
    currency: 'EUR',
    dueDate: '2026-10-08',
    status: 'sent',
    sentAt: new Date('2026-10-01T06:00:00Z'),
    paidAt: null,
    lastChasedAt: null,
    overdueDays: 0,
    pdfAvailable: true,
    payments: [],
    legalInvoice: null,
    label: 'Retainer Essencial · outubro de 2026',
    origin: 'month',
    ...overrides,
  };
}

const ACTIONS: RequestActions = {
  chase: vi.fn(async () => ({ ok: true as const })),
  void: vi.fn(async () => ({ ok: true as const })),
  record: vi.fn(async () => ({ ok: true as const })),
  settle: vi.fn(async () => ({ ok: true as const })),
  invoiceUpload: vi.fn(async () => ({ ok: false as const, code: 'not_found' })),
  registerInvoice: vi.fn(async () => ({ ok: true as const })),
};

function show(view: RetainerBillingView) {
  return render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <RetainerBilling view={view} actions={ACTIONS} />
    </NextIntlClientProvider>,
  );
}

const TWO_REQUESTS = [
  request({}),
  request({
    id: '7a2d3d54-57e5-4e66-8b4f-7d1a0c2e1b22',
    number: 'PP-2026-0002',
    amount: '150.00',
    label: 'Pedido extra: Campanha de Natal',
    origin: 'extra',
  }),
];

describe('C-10 retainer billing', () => {
  it('the retainer billing lists month and extra requests with their actions', () => {
    show({ canWrite: true, contractMissing: false, requests: TWO_REQUESTS });
    const section = screen.getByRole('region', { name: 'Faturação' });
    const items = within(section).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(
      within(items[0] as HTMLElement).getByText('Retainer Essencial · outubro de 2026'),
    ).toBeTruthy();
    expect(within(items[0] as HTMLElement).getByText(/1500,00\s€/)).toBeTruthy();
    expect(
      within(items[1] as HTMLElement).getByText('Pedido extra: Campanha de Natal'),
    ).toBeTruthy();
    expect(within(section).getAllByRole('button', { name: 'Registar pagamento' })).toHaveLength(2);
  });

  it('without a signed contract the team is told why nothing is billed', () => {
    show({ canWrite: true, contractMissing: true, requests: [] });
    expect(
      screen.getByText(
        'Sem contrato assinado com este cliente: o OS não emite os pedidos do retainer.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Ainda não há pedidos de pagamento.')).toBeTruthy();
  });

  it('a reader without write sees no actions', () => {
    show({ canWrite: false, contractMissing: false, requests: TWO_REQUESTS });
    expect(screen.queryByRole('button', { name: 'Registar pagamento' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cobrar' })).toBeNull();
  });
});
