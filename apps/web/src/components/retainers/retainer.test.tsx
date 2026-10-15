// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { RetainerExtraRow, StaffRetainerView } from '@/modules/retainers';
import { ExtraRequests } from './extra-requests';
import { LimitBars } from './limit-bars';
import { RetainerScreen, type RetainerActions } from './retainer-screen';
import { UsageForm } from './usage-form';

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

const LIMITS: StaffRetainerView['limits'] = [
  {
    kind: 'content_pieces',
    limit: 4,
    carry: 0.8,
    available: 4.8,
    used: 2,
    remaining: 2.8,
    percent: 42,
  },
  {
    kind: 'maintenance_hours',
    limit: 10,
    carry: 0,
    available: 10,
    used: 9,
    remaining: 1,
    percent: 90,
  },
];

const EXTRA: RetainerExtraRow = {
  id: 'extra-1',
  kind: 'campaigns',
  description: 'Campanha de Natal',
  quantity: 1,
  quoteAmount: null,
  currency: null,
  status: 'requested',
  createdAt: '2026-10-10T10:00:00.000Z',
};

function view(overrides: Partial<StaffRetainerView> = {}): StaffRetainerView {
  return {
    canWrite: true,
    canSeeFee: true,
    month: '2026-10-01',
    projects: [{ id: 'project-1', name: 'Retainer Bloom' }],
    retainer: {
      id: 'retainer-1',
      projectId: 'project-1',
      tier: 'Essencial',
      monthlyFee: '1500.00',
      currency: 'EUR',
      startsOn: '2026-07-01',
      reviewOn: '2027-07-01',
      status: 'active',
    },
    limits: LIMITS,
    usage: [],
    extraRequests: [EXTRA],
    ...overrides,
  };
}

function actions(): RetainerActions {
  return {
    saveRetainer: vi.fn(async () => ({ ok: true as const })),
    recordUsage: vi.fn(async () => ({ ok: true as const })),
    deleteUsage: vi.fn(async () => ({ ok: true as const })),
    quoteExtra: vi.fn(async () => ({ ok: true as const })),
  };
}

describe('C-10 retainer', () => {
  it('the bars show used, carry and available per limit', () => {
    withIntl(<LimitBars limits={LIMITS} />);
    const pieces = screen.getByRole('region', { name: 'Peças de conteúdo' });
    expect(within(pieces).getByText('2 de 4,8')).toBeTruthy();
    expect(within(pieces).getByText('Inclui 0,8 transportado do mês anterior.')).toBeTruthy();
    expect(within(pieces).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('42');
    const hours = screen.getByRole('region', { name: 'Horas de manutenção' });
    expect(within(hours).getByText('9 de 10')).toBeTruthy();
    expect(within(hours).queryByText(/transportado/)).toBeNull();
  });

  it('usage above the available shows the extra request hint', async () => {
    const record = vi.fn(async () => ({ ok: false as const, code: 'limit_reached' }));
    withIntl(<UsageForm retainerId="retainer-1" limits={LIMITS} record={record} />);
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Carrossel' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registar' }));
    await screen.findByText(
      'Este registo passa o disponível do mês. O trabalho acima do limite só começa com um pedido extra aprovado pelo cliente.',
    );
    expect(record).toHaveBeenCalledWith({
      retainerId: 'retainer-1',
      kind: 'content_pieces',
      quantity: '3',
      description: 'Carrossel',
    });
  });

  it('quoting an extra request sends the amount', async () => {
    const quote = vi.fn(async () => ({ ok: true as const }));
    withIntl(<ExtraRequests extras={[EXTRA]} canWrite quote={quote} />);
    expect(screen.getByText('À espera de orçamento')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Valor do orçamento'), { target: { value: '150,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar orçamento' }));
    await screen.findByText('Orçamento enviado ao cliente.');
    expect(quote).toHaveBeenCalledWith('extra-1', '150.00', 'EUR');
  });

  it('freelancers see no fee and no write actions', () => {
    withIntl(
      <RetainerScreen
        view={view({
          canWrite: false,
          canSeeFee: false,
          retainer: {
            id: 'retainer-1',
            projectId: 'project-1',
            tier: 'Essencial',
            monthlyFee: null,
            currency: 'EUR',
            startsOn: '2026-07-01',
            reviewOn: '2027-07-01',
            status: 'active',
          },
        })}
        actions={actions()}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Retainer' })).toBeTruthy();
    expect(screen.queryByText(/Valor mensal/)).toBeNull();
    for (const name of ['Editar retainer', 'Registar', 'Enviar orçamento']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('writers without a retainer can create one', () => {
    withIntl(
      <RetainerScreen
        view={view({ retainer: null, limits: [], extraRequests: [] })}
        actions={actions()}
      />,
    );
    expect(screen.getByText('Este cliente ainda não tem retainer.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guardar retainer' })).toBeTruthy();
    expect(screen.getByLabelText('Projeto')).toBeTruthy();
  });
});
