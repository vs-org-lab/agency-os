// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { RetainerExtraRow, StaffRetainerView } from '@/modules/retainers';
import { chooseDay, chooseOption, installRadixDomPolyfills } from '../../../test/radix-dom';
import { MotionProvider } from '@agency-os/ui/motion';
import { ExtraRequests } from './extra-requests';
import { LimitRings } from './limit-rings';
import { RetainerForm } from './retainer-form';
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

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

beforeAll(() => {
  installRadixDomPolyfills();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function withIntl(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider
      locale="pt-PT"
      messages={messages}
      timeZone="Europe/Lisbon"
      now={new Date('2026-10-26T12:00:00Z')}
    >
      <MotionProvider>{node}</MotionProvider>
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
  it('shows one ring per limit kind with remaining', () => {
    withIntl(<LimitRings limits={LIMITS} />);
    const pieces = screen.getByRole('group', { name: 'Peças de conteúdo' });
    expect(within(pieces).getByText('Disponível: 2,8')).toBeTruthy();
    expect(within(pieces).getByText('2 de 4,8')).toBeTruthy();
    expect(screen.getByText('Inclui 0,8 transportado do mês anterior.')).toBeTruthy();
    const hours = screen.getByRole('group', { name: 'Horas de manutenção' });
    expect(within(hours).getByText('9 de 10')).toBeTruthy();
    expect(screen.queryByText(/Inclui 0 /)).toBeNull();
  });

  it('shows the days left until the month closes in Lisbon', () => {
    withIntl(<LimitRings limits={LIMITS} />);
    const period = screen.getByRole('group', { name: 'Período' });
    expect(within(period).getByText('5 dias para o fecho')).toBeTruthy();
  });

  it('over limit shows zero remaining in danger', () => {
    withIntl(
      <LimitRings
        limits={[
          {
            kind: 'campaigns',
            limit: 2,
            carry: 0,
            available: 2,
            used: 3,
            remaining: -1,
            percent: 150,
          },
        ]}
      />,
    );
    const ring = screen.getByRole('group', { name: 'Campanhas' });
    expect(ring.getAttribute('data-tone')).toBe('danger');
    expect(within(ring).getByText('Disponível: 0')).toBeTruthy();
  });

  it('usage above the available shows the extra request hint', async () => {
    const record = vi.fn(async () => ({ ok: false as const, code: 'limit_reached' }));
    withIntl(
      <UsageForm retainerId="retainer-1" limits={LIMITS} record={record} onDone={vi.fn()} />,
    );
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

  it('usage form submits the chosen kind as before', async () => {
    const user = userEvent.setup();
    const record = vi.fn(async () => ({ ok: true as const }));
    const onDone = vi.fn();
    withIntl(<UsageForm retainerId="retainer-1" limits={LIMITS} record={record} onDone={onDone} />);

    await chooseOption(user, 'Tipo', 'Horas de manutenção');
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Atualizações' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registar' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Consumo registado.'));

    expect(record).toHaveBeenCalledWith({
      retainerId: 'retainer-1',
      kind: 'maintenance_hours',
      quantity: '1',
      description: 'Atualizações',
    });
  });

  it('register usage opens a dialog and notifies on success', async () => {
    const user = userEvent.setup();
    const retainerActions = actions();
    withIntl(<RetainerScreen view={view()} actions={retainerActions} />);
    expect(screen.queryByLabelText('Descrição')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Registar consumo' }));
    fireEvent.change(await screen.findByLabelText('Descrição'), { target: { value: 'Reels' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registar' }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Consumo registado.', undefined),
    );
    await waitFor(() => expect(screen.queryByLabelText('Descrição')).toBeNull());
    expect(retainerActions.recordUsage).toHaveBeenCalledWith({
      retainerId: 'retainer-1',
      kind: 'content_pieces',
      quantity: '1',
      description: 'Reels',
    });
  });

  it('empty usage shows an empty state and entries have a named delete', () => {
    withIntl(<RetainerScreen view={view()} actions={actions()} />);
    expect(screen.getByText('Ainda não há consumo este mês.')).toBeTruthy();
    cleanup();

    withIntl(
      <RetainerScreen
        view={view({
          usage: [
            {
              id: 'usage-1',
              kind: 'content_pieces',
              quantity: 1,
              description: 'Reels',
              extra: false,
              createdAt: '2026-10-10T10:00:00.000Z',
            },
          ],
        })}
        actions={actions()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Apagar registo: Reels' })).toBeTruthy();
  });

  it('retainer form submits the same data as before', async () => {
    const user = userEvent.setup();
    const save = vi.fn(async () => ({ ok: true as const }));
    withIntl(<RetainerForm clientId="client-1" view={view()} save={save} onDone={vi.fn()} />);

    await chooseOption(user, 'Moeda', 'GBP');
    await chooseOption(user, 'Estado', 'Terminado');
    await chooseDay(user, /^Início/, 5);
    await chooseDay(user, /^Revisão anual/, 20);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar retainer' }));
    await screen.findByText('Retainer guardado.');

    expect(save).toHaveBeenCalledWith({
      clientId: 'client-1',
      projectId: 'project-1',
      tier: 'Essencial',
      monthlyFee: '1500.00',
      currency: 'GBP',
      startsOn: '2026-07-05',
      reviewOn: '2027-07-20',
      status: 'ended',
      limits: [
        { kind: 'content_pieces', monthlyLimit: '4' },
        { kind: 'maintenance_hours', monthlyLimit: '10' },
      ],
    });
  });

  it('retainer form refuses to save without the two dates', async () => {
    const save = vi.fn(async () => ({ ok: true as const }));
    withIntl(
      <RetainerForm
        clientId="client-1"
        view={view({ retainer: null, limits: [] })}
        save={save}
        onDone={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Nível'), { target: { value: 'Essencial' } });
    fireEvent.change(screen.getByLabelText('Valor mensal'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar retainer' }));

    expect(await screen.findByText('Verifique os campos.')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
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

  it('quotes an extra request in the chosen currency', async () => {
    const user = userEvent.setup();
    const quote = vi.fn(async () => ({ ok: true as const }));
    withIntl(<ExtraRequests extras={[EXTRA]} canWrite quote={quote} />);

    fireEvent.change(screen.getByLabelText('Valor do orçamento'), { target: { value: '90' } });
    await chooseOption(user, 'Moeda', 'GBP');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar orçamento' }));

    await screen.findByText('Orçamento enviado ao cliente.');
    expect(quote).toHaveBeenCalledWith('extra-1', '90', 'GBP');
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
