// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MotionProvider } from '@agency-os/ui/motion';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { ClientRetainerRequest } from '@/modules/retainers';
import { ActionList, type PortalActionItem } from './action-list';
import { PlanPanel } from './plan-panel';
import { ProjectOverview } from './home-cards';
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
  it('action list says the client is all caught up without items', () => {
    intl(<ActionList items={[]} />);

    expect(screen.getByRole('heading', { name: 'A sua vez' })).toBeTruthy();
    expect(screen.getByText('Está tudo em dia. Avisamos quando precisarmos de si.')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
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
    const first = within(rows[0] as HTMLElement);
    expect(first.getByText('Fase de design')).toBeTruthy();
    expect(first.getByText(/Até/)).toBeTruthy();
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

describe('RequestBoard list view', () => {
  it('lists every visible request with its state', () => {
    intl(
      <RequestBoard
        month={NOW_MONTH}
        view="list"
        requests={[request('a', 'received'), request('d', 'done', '2026-09-28T10:00:00.000Z')]}
      />,
    );

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(within(rows[0] as HTMLElement).getByText('Recebido')).toBeTruthy();
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

describe('ProjectOverview', () => {
  it('marks the current phase and shows the next step and the way into the timeline', () => {
    intl(
      <ProjectOverview
        project={{
          id: 'p1',
          name: 'Website',
          status: 'active',
          startsOn: '2026-10-01',
          endsOn: null,
          approvals: [],
          updates: [],
          phases: [
            {
              id: '1',
              position: 1,
              name: 'Descoberta',
              status: 'done',
              requiresApproval: false,
              dueOn: null,
              startedAt: null,
              completedAt: null,
              steps: [],
            },
            {
              id: '2',
              position: 2,
              name: 'Design',
              status: 'in_progress',
              requiresApproval: true,
              dueOn: null,
              startedAt: null,
              completedAt: null,
              steps: [
                {
                  id: 's1',
                  position: 1,
                  name: 'Revisão do layout',
                  status: 'todo',
                  dueOn: '2026-11-10',
                  reopened: false,
                },
              ],
            },
            {
              id: '3',
              position: 3,
              name: 'Entrega',
              status: 'pending',
              requiresApproval: false,
              dueOn: null,
              startedAt: null,
              completedAt: null,
              steps: [],
            },
          ],
        }}
      />,
    );

    const phases = screen.getAllByRole('listitem');
    expect(phases).toHaveLength(3);
    expect(phases[1]?.getAttribute('aria-current')).toBe('step');
    expect(screen.getByText('33% concluído')).toBeTruthy();
    expect(screen.getByText('Revisão do layout')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Linha temporal' }).getAttribute('href')).toBe(
      '/portal/updates?view=timeline',
    );
  });

  it('tells the client the project starts soon before there is one', () => {
    intl(<ProjectOverview project={null} />);

    expect(screen.getByRole('heading', { name: 'O seu projeto começa em breve' })).toBeTruthy();
  });
});
