// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { PortalRetainerView } from '@/modules/retainers';
import { PortalRetainer, type PortalRetainerActions } from './portal-retainer';

vi.mock('@/i18n/navigation', () => ({
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

function view(decides: boolean): PortalRetainerView {
  return {
    decides,
    month: '2026-10-01',
    retainer: { id: 'retainer-1', tier: 'Essencial', status: 'active' },
    limits: [
      {
        kind: 'content_pieces',
        limit: 4,
        carry: 0.8,
        available: 4.8,
        used: 2,
        remaining: 2.8,
        percent: 42,
      },
    ],
    extraRequests: [
      {
        id: 'extra-1',
        kind: 'campaigns',
        description: 'Campanha de Natal',
        quantity: 1,
        quoteAmount: '150.00',
        currency: 'EUR',
        status: 'quoted',
        createdAt: '2026-10-10T10:00:00.000Z',
      },
    ],
  };
}

function actions(outcome: 'task' | 'extra' = 'task'): PortalRetainerActions & {
  request: ReturnType<typeof vi.fn>;
  decide: ReturnType<typeof vi.fn>;
} {
  return {
    request: vi.fn(async () => ({ ok: true as const, outcome })),
    decide: vi.fn(async () => ({ ok: true as const })),
  };
}

describe('P-10 retainer', () => {
  it('the client sees the month per limit', () => {
    withIntl(<PortalRetainer view={view(true)} actions={actions()} />);
    const pieces = screen.getByRole('region', { name: 'Peças de conteúdo' });
    expect(within(pieces).getByText('2 de 4,8')).toBeTruthy();
    expect(screen.queryByText(/1500|Valor mensal/)).toBeNull();
  });

  it('a request reports a task or an extra request', async () => {
    const taskActions = actions('task');
    const { unmount } = withIntl(<PortalRetainer view={view(true)} actions={taskActions} />);
    fireEvent.change(screen.getByLabelText('O que precisa'), {
      target: { value: 'Publicação do evento' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    await screen.findByText('Pedido recebido: a equipa já tem a tarefa.');
    expect(taskActions.request).toHaveBeenCalledWith({
      retainerId: 'retainer-1',
      kind: 'content_pieces',
      description: 'Publicação do evento',
      quantity: '1',
    });
    unmount();

    withIntl(<PortalRetainer view={view(true)} actions={actions('extra')} />);
    fireEvent.change(screen.getByLabelText('O que precisa'), { target: { value: 'Série' } });
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    await screen.findByText(
      'Este pedido passa o limite do mês. A equipa vai enviar um orçamento para aprovar antes de começar.',
    );
  });

  it('the decision maker approves or declines a quoted extra; the operational sees it only', async () => {
    const decideActions = actions();
    const { unmount } = withIntl(<PortalRetainer view={view(true)} actions={decideActions} />);
    const extra = screen.getByRole('listitem');
    expect(within(extra).getByText(/150,00\s€/)).toBeTruthy();
    fireEvent.click(within(extra).getByRole('button', { name: 'Aprovar orçamento' }));
    await screen.findByText('Orçamento aprovado. A equipa vai começar.');
    expect(decideActions.decide).toHaveBeenCalledWith('extra-1', 'approved');
    unmount();

    withIntl(<PortalRetainer view={view(false)} actions={actions()} />);
    expect(screen.getByText('Campanha de Natal')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aprovar orçamento' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Recusar' })).toBeNull();
  });
});
