// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MotionProvider } from '@agency-os/ui/motion';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { ClientRetainerRequest } from '@/modules/retainers';
import { ActionList, type PortalActionItem } from './action-list';
import { PlanPanel } from './plan-panel';
import { ProjectStrip } from './project-strip';
import { RequestBoard } from './request-board';

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

beforeAll(() => {
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

afterEach(cleanup);

function intl(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <MotionProvider>{node}</MotionProvider>
    </NextIntlClientProvider>,
  );
}

describe('ActionList', () => {
  it('action list hides without items', () => {
    const { container } = intl(<ActionList items={[]} />);

    expect(container.textContent).toBe('');
  });

  it('action list orders by due date and links each item', () => {
    const items: PortalActionItem[] = [
      {
        kind: 'payment',
        title: 'Fatura PP-2026-0002',
        dueOn: '2026-11-20',
        href: '/portal/invoices',
      },
      { kind: 'proof', title: 'Cartaz', dueOn: null, href: '/portal/proofs/v1' },
      { kind: 'approval', title: 'Fase de design', dueOn: '2026-11-02', href: '/portal/approvals' },
    ];

    intl(<ActionList items={items} />);

    const rows = screen.getAllByRole('listitem');
    expect(rows.map((row) => within(row).getByRole('link').getAttribute('href'))).toEqual([
      '/portal/approvals',
      '/portal/invoices',
      '/portal/proofs/v1',
    ]);
    expect(within(rows[0]!).getByText('Fase de design')).toBeTruthy();
    expect(within(rows[0]!).getByText(/Até/)).toBeTruthy();
  });
});

const NOW_MONTH = '2026-10-01';

function request(
  id: string,
  state: ClientRetainerRequest['state'],
  completedAt: string | null = null,
): ClientRetainerRequest {
  return {
    id,
    description: `Pedido ${id}`,
    state,
    createdAt: '2026-10-05T10:00:00.000Z',
    completedAt,
  };
}

describe('RequestBoard', () => {
  it('board counts columns and keeps only this month in done', () => {
    intl(
      <RequestBoard
        month={NOW_MONTH}
        requests={[
          request('a', 'received'),
          request('b', 'in_progress'),
          request('c', 'in_progress'),
          request('d', 'done', '2026-10-20T10:00:00.000Z'),
          request('e', 'done', '2026-09-28T10:00:00.000Z'),
        ]}
      />,
    );

    const column = (name: string) => screen.getByRole('region', { name: new RegExp(`^${name}`) });
    expect(within(column('Recebido')).getAllByRole('listitem')).toHaveLength(1);
    expect(within(column('Em curso')).getAllByRole('listitem')).toHaveLength(2);
    expect(within(column('Feito este mês')).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByText('Pedido e')).toBeNull();
    expect(within(column('Em curso')).getByText('2')).toBeTruthy();
  });

  it('shows a short empty text per empty column', () => {
    intl(<RequestBoard month={NOW_MONTH} requests={[request('a', 'received')]} />);

    expect(screen.getByText('Nada em curso.')).toBeTruthy();
    expect(screen.getByText('Nada concluído este mês.')).toBeTruthy();
  });
});

describe('PlanPanel', () => {
  it('plan panel shows limits and rules', () => {
    intl(
      <PlanPanel
        plan={{
          tier: 'Essencial',
          limits: [
            { kind: 'content_pieces', limit: 4 },
            { kind: 'maintenance_hours', limit: 10 },
          ],
        }}
      />,
    );

    expect(screen.getByText('Nível Essencial')).toBeTruthy();
    expect(screen.getByText('Peças de conteúdo')).toBeTruthy();
    expect(screen.getByText('4 por mês')).toBeTruthy();
    expect(screen.getByText('10 por mês')).toBeTruthy();
    expect(screen.getByText(/Até 20%/)).toBeTruthy();
    expect(screen.getByText(/pede um orçamento/)).toBeTruthy();
  });
});

describe('ProjectStrip', () => {
  it('project strip marks the current phase', () => {
    intl(
      <ProjectStrip
        phases={[
          { id: '1', name: 'Descoberta', status: 'done' },
          { id: '2', name: 'Design', status: 'in_progress' },
          { id: '3', name: 'Entrega', status: 'pending' },
        ]}
        current="2"
        nextMilestone={{ name: 'Revisão do layout', dueOn: '2026-11-10' }}
      />,
    );

    const steps = screen.getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    expect(steps[1]?.getAttribute('aria-current')).toBe('step');
    expect(steps[0]?.getAttribute('aria-current')).toBeNull();
    expect(screen.getByText(/Revisão do layout/)).toBeTruthy();
  });
});
