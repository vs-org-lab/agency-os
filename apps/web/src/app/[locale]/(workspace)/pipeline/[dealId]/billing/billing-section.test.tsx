// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { DealBilling, PaymentRequestView } from '@/modules/billing';
import { BillingSection, type BillingActions } from './billing-section';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
});

const REQUEST: PaymentRequestView = {
  id: '6f1c2c43-46d4-4d55-9a3e-6c0f9b1d0a11',
  number: 'PP-2026-0001',
  amount: '6000.00',
  currency: 'EUR',
  dueDate: '2026-10-16',
  status: 'sent',
  sentAt: new Date('2026-10-09T10:00:00Z'),
  paidAt: null,
  lastChasedAt: null,
  overdueDays: 4,
  pdfAvailable: true,
  payments: [],
  legalInvoice: null,
};

function billing(request: Partial<PaymentRequestView> | null): DealBilling {
  return {
    milestones: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        position: 1,
        label: 'Assinatura',
        percent: 50,
        amount: '6000.00',
        currency: 'EUR',
        status: request?.status === 'paid' ? 'paid' : 'requested',
        request: request ? { ...REQUEST, ...request } : null,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        position: 2,
        label: 'Entrega',
        percent: 50,
        amount: '6000.00',
        currency: 'EUR',
        status: 'pending',
        request: null,
      },
    ],
  };
}

function actionsMock(overrides: Partial<BillingActions> = {}): BillingActions {
  const ok = async () => ({ ok: true }) as const;
  return {
    createPlan: vi.fn(ok),
    request: vi.fn(ok),
    chase: vi.fn(ok),
    void: vi.fn(ok),
    record: vi.fn(ok),
    settle: vi.fn(ok),
    invoiceUpload: vi.fn(
      async () =>
        ({
          ok: true,
          uploadUrl: 'https://upload.test',
          uploadPath: 'org/client/invoices/r/f.pdf',
        }) as const,
    ),
    registerInvoice: vi.fn(ok),
    ...overrides,
  };
}

function renderSection(
  data: DealBilling | null,
  writable: boolean,
  actions = actionsMock(),
  canCreatePlan = false,
) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <BillingSection
        dealId="33333333-3333-4333-8333-333333333333"
        billing={data}
        writable={writable}
        canCreatePlan={canCreatePlan}
        actions={actions}
      />
    </NextIntlClientProvider>,
  );
  return actions;
}

describe('BillingSection', () => {
  it('shows the overdue badge and the request pdf', () => {
    renderSection(billing({}), true);

    expect(screen.getByText('Em atraso há 4 dias')).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'PDF do pedido PP-2026-0001' }).getAttribute('href'),
    ).toBe(`/api/billing/request/${REQUEST.id}`);
  });

  it('payment form keeps values when refused', async () => {
    const actions = renderSection(
      billing({}),
      true,
      actionsMock({ record: vi.fn(async () => ({ ok: false, code: 'invalid_input' }) as const) }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Registar pagamento' }));
    const form = screen.getByRole('form', { name: 'Registar pagamento PP-2026-0001' });
    fireEvent.change(within(form).getByLabelText('Valor'), { target: { value: '5000.00' } });
    fireEvent.change(within(form).getByLabelText('Referência'), { target: { value: 'TRF 9' } });
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Guardar pagamento' }));
    });

    expect(actions.record).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: REQUEST.id, amount: '5000.00', reference: 'TRF 9' }),
    );
    expect((within(form).getByLabelText('Valor') as HTMLInputElement).value).toBe('5000.00');
    expect(screen.getByRole('alert').textContent).toBe('Confirme os campos.');
  });

  it('highlights a paid request without legal invoice', () => {
    renderSection(billing({ status: 'paid', overdueDays: 0, paidAt: new Date() }), true);

    expect(screen.getByText('Falta registar a fatura legal.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Registar fatura legal' })).toBeDefined();
    expect(screen.queryByText(/Em atraso/)).toBeNull();
  });

  it('manager sees no actions', () => {
    renderSection(billing({}), false);

    expect(screen.getByText(/^PP-2026-0001 · vence a/)).toBeDefined();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers to create the plan of a signed contract without one', async () => {
    const actions = renderSection(null, true, actionsMock(), true);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Criar plano de pagamentos' }));
    });

    expect(actions.createPlan).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333');
    expect(screen.getByRole('status').textContent).toBe('Plano criado e primeiro pedido enviado.');
  });

  it('explains the empty plan before the contract is signed', () => {
    renderSection(null, true);

    expect(
      screen.getByText(
        'O plano de pagamentos é criado quando o contrato fica assinado pelas duas partes.',
      ),
    ).toBeDefined();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
