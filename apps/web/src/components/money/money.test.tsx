// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { MoneyYearView } from '@/modules/money';
import { ExpenseForm, type ExpenseFormActions } from './expense-form';
import { ExpensesTable } from './expenses-table';
import { MoneyScreen, type MoneyActions } from './money-screen';
import { MoneySummary } from './money-summary';
import { SubscriptionsList } from './subscriptions-list';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

function withIntl(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      {node}
    </NextIntlClientProvider>,
  );
}

const CLIENTS = [
  {
    id: 'client-a',
    name: 'Atlas',
    requests: [
      { id: 'request-1', number: 'PP-2026-0001' },
      { id: 'request-2', number: 'PP-2026-0002' },
    ],
  },
  { id: 'client-b', name: 'Bloom', requests: [{ id: 'request-3', number: 'PP-2026-0003' }] },
];

const EXPENSE = {
  id: 'expense-1',
  spentOn: '2026-10-02',
  vendor: 'Gráfica Porto',
  description: 'Cartões',
  category: 'other' as const,
  amount: '48.90',
  currency: 'EUR' as const,
  clientId: 'client-a',
  clientName: 'Atlas',
  paymentRequestId: null,
  paymentRequestNumber: null,
  hasReceipt: true,
};

function actions(): MoneyActions {
  return {
    startUpload: vi.fn(async () => ({
      ok: true as const,
      receiptId: 'receipt-1',
      uploadUrl: 'https://upload',
    })),
    readReceipt: vi.fn(async () => ({ ok: true as const, mimeType: 'image/png', proposal: null })),
    saveExpense: vi.fn(async () => ({ ok: true as const })),
    deleteExpense: vi.fn(async () => ({ ok: true as const })),
    linkExpense: vi.fn(async () => ({ ok: true as const })),
    saveSubscription: vi.fn(async () => ({ ok: true as const })),
    renewSubscription: vi.fn(async () => ({ ok: true as const })),
    cancelSubscription: vi.fn(async () => ({ ok: true as const })),
  };
}

describe('S-09 money', () => {
  it('the summary shows a line per currency', () => {
    withIntl(
      <MoneySummary
        summary={{
          received: { EUR: '6000.00', USD: '50.00' },
          open: {},
          spent: { EUR: '360.00' },
        }}
      />,
    );
    const received = screen.getByRole('region', { name: 'Entrou' });
    expect(within(received).getByText(/6000,00\s€/)).toBeTruthy();
    expect(within(received).getByText(/50,00\sUS\$/)).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'Em aberto' })).getByText('Sem valores'),
    ).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'Saiu' })).getByText(/360,00\s€/),
    ).toBeTruthy();
  });

  it('the receipt proposal fills empty fields and waits for confirmation', async () => {
    const formActions: ExpenseFormActions = {
      startUpload: vi.fn(async () => ({
        ok: true as const,
        receiptId: 'receipt-1',
        uploadUrl: 'https://upload',
      })),
      readReceipt: vi.fn(async () => ({
        ok: true as const,
        mimeType: 'image/png',
        proposal: {
          spentOn: '2026-10-02',
          vendor: 'Gráfica Exemplo',
          amount: '48.90',
          currency: 'EUR' as const,
          description: 'Cartões de visita',
        },
      })),
      saveExpense: vi.fn(async () => ({ ok: true as const })),
    };
    const upload = vi.fn(async () => true);
    withIntl(
      <ExpenseForm clients={CLIENTS} actions={formActions} upload={upload} onDone={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText('Fornecedor'), { target: { value: 'Minha gráfica' } });
    const file = new File([new Uint8Array([1, 2, 3])], 'recibo.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Recibo (JPEG, PNG, WebP ou PDF, até 10 MB)'), {
      target: { files: [file] },
    });
    await screen.findByText('Proposta lida do recibo. Confirme antes de guardar.');
    expect(upload).toHaveBeenCalledWith('https://upload', file);
    expect((screen.getByLabelText('Fornecedor') as HTMLInputElement).value).toBe('Minha gráfica');
    expect((screen.getByLabelText('Valor') as HTMLInputElement).value).toBe('48.90');
    expect((screen.getByLabelText('Data') as HTMLInputElement).value).toBe('2026-10-02');
    expect(formActions.saveExpense).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar despesa' }));
    await screen.findByText('Despesa guardada.');
    expect(formActions.saveExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        vendor: 'Minha gráfica',
        amount: '48.90',
        currency: 'EUR',
        receiptId: 'receipt-1',
        receiptName: 'recibo.png',
      }),
    );
  });

  it('renewals soon and overdue are highlighted', () => {
    const base = {
      vendor: '',
      category: 'software' as const,
      amount: '10.00',
      currency: 'EUR' as const,
      cycle: 'monthly' as const,
    };
    withIntl(
      <SubscriptionsList
        canWrite
        actions={actions()}
        subscriptions={[
          {
            ...base,
            id: 's1',
            name: 'Hosting',
            nextRenewalOn: '2026-10-10',
            status: 'active',
            renewal: 'overdue',
          },
          {
            ...base,
            id: 's2',
            name: 'Breve',
            nextRenewalOn: '2026-10-18',
            status: 'active',
            renewal: 'soon',
          },
          {
            ...base,
            id: 's3',
            name: 'Longe',
            nextRenewalOn: '2026-12-01',
            status: 'active',
            renewal: 'later',
          },
          {
            ...base,
            id: 's4',
            name: 'Fim',
            nextRenewalOn: '2026-09-01',
            status: 'cancelled',
            renewal: null,
          },
        ]}
      />,
    );
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0] as HTMLElement).getByText('Atrasada')).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText('Em breve')).toBeTruthy();
    expect(within(rows[2] as HTMLElement).queryByText(/Atrasada|Em breve/)).toBeNull();
    expect(within(rows[3] as HTMLElement).getByText('Cancelada')).toBeTruthy();
    expect(
      within(rows[3] as HTMLElement).queryByRole('button', { name: 'Registar renovação' }),
    ).toBeNull();
  });

  it('managers see no write actions', () => {
    const view: MoneyYearView = {
      canWrite: false,
      year: 2026,
      years: [2025, 2026],
      summary: { received: {}, open: {}, spent: {} },
      requests: [],
      expenses: [EXPENSE],
      subscriptions: [
        {
          id: 's1',
          name: 'Figma',
          vendor: '',
          category: 'software',
          amount: '45.00',
          currency: 'EUR',
          cycle: 'monthly',
          nextRenewalOn: '2026-11-01',
          status: 'active',
          renewal: 'later',
        },
      ],
      clients: CLIENTS,
    };
    withIntl(<MoneyScreen view={view} actions={actions()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Dinheiro' })).toBeTruthy();
    for (const name of ['Nova despesa', 'Nova subscrição', 'Apagar', 'Registar renovação']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.queryByRole('combobox', { name: 'Ligar a um pedido' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Recibo' }).getAttribute('href')).toBe(
      '/api/money/receipts/expense-1',
    );
  });

  it("linking offers only the expense client's requests", async () => {
    const tableActions = actions();
    withIntl(
      <ExpensesTable expenses={[EXPENSE]} clients={CLIENTS} canWrite actions={tableActions} />,
    );
    const select = screen.getByRole('combobox', { name: 'Ligar a um pedido' });
    const options = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options).toEqual(['Sem pedido', 'PP-2026-0001', 'PP-2026-0002']);
    fireEvent.change(select, { target: { value: 'request-2' } });
    await screen.findByText('Ligação guardada.');
    expect(tableActions.linkExpense).toHaveBeenCalledWith('expense-1', 'request-2');
  });
});
