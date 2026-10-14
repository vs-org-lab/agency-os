// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { AgendaItem } from '@/modules/agenda';
import type { HomeItem, HomeView } from '@/modules/studio';
import { ClientProgress } from './client-progress';
import { HomeIndicators } from './indicators';
import { TodayList } from './today-list';
import { UpcomingEvents } from './upcoming-events';

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

afterEach(() => {
  cleanup();
});

function renderWithIntl(node: React.ReactNode) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      {node}
    </NextIntlClientProvider>,
  );
}

const INDICATORS: HomeView['indicators'] = {
  clients: 3,
  activeProjects: 4,
  waiting: 5,
  receivable: [{ currency: 'EUR', amountMinor: 600000n }],
};

function item(overrides: Partial<HomeItem>): HomeItem {
  return {
    kind: 'task',
    id: crypto.randomUUID(),
    title: 'Ligar ao cliente',
    clientName: 'Atlas Lda',
    href: '/tasks',
    dueAt: new Date('2026-10-12T00:00:00Z'),
    overdue: false,
    sequenceDay: null,
    ...overrides,
  };
}

describe('home components', () => {
  it('indicators show receivable when the reader has billing', () => {
    renderWithIntl(<HomeIndicators indicators={INDICATORS} />);

    expect(screen.getByText('Por receber')).toBeTruthy();
    expect(screen.getByText(/6000,00/)).toBeTruthy();
    expect(screen.getByText('À espera de si')).toBeTruthy();
  });

  it('indicators hide receivable when null', () => {
    renderWithIntl(<HomeIndicators indicators={{ ...INDICATORS, receivable: null }} />);

    expect(screen.queryByText('Por receber')).toBeNull();
    expect(screen.getByText('Projetos ativos')).toBeTruthy();
  });

  it('today list links each kind', () => {
    const items = [
      item({ kind: 'payment', title: 'PP-2026-0001', href: '/pipeline/deal-1', overdue: true }),
      item({ kind: 'step', title: 'Moodboard', href: '/c/client-1', overdue: true }),
      item({ kind: 'approval', title: 'Identidade', href: '/c/client-1', overdue: true }),
      item({ kind: 'task', title: 'Ligar ao cliente', href: '/c/client-1/tasks' }),
      item({ kind: 'follow_up', sequenceDay: 3, title: '', href: '/pipeline/deal-2' }),
      item({ kind: 'queue_b', title: '', href: '/applications?tab=queue_b' }),
    ];
    renderWithIntl(<TodayList items={items} />);

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      items.map((entry) => entry.href),
    );
    expect(within(links[0] as HTMLElement).getByText('Pedido PP-2026-0001 vencido')).toBeTruthy();
    expect(within(links[1] as HTMLElement).getByText('Passo atrasado: Moodboard')).toBeTruthy();
    expect(
      within(links[2] as HTMLElement).getByText('Alterações pedidas: Identidade'),
    ).toBeTruthy();
    expect(within(links[3] as HTMLElement).getByText('Tarefa: Ligar ao cliente')).toBeTruthy();
    expect(within(links[4] as HTMLElement).getByText('Acompanhamento do dia 3')).toBeTruthy();
    expect(screen.getAllByText('Atrasado')).toHaveLength(3);
  });

  it('client progress shows done phases and a missing project', () => {
    renderWithIntl(
      <ClientProgress
        clients={[
          {
            id: 'client-1',
            name: 'Atlas Lda',
            progress: { done: 1, total: 4 },
            lastActivityAt: new Date('2026-10-10T10:00:00Z'),
          },
          { id: 'client-2', name: 'Boreal SA', progress: null, lastActivityAt: null },
        ]}
      />,
    );

    const bar = screen.getByRole('progressbar', { name: 'Atlas Lda' });
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
    expect(bar.getAttribute('aria-valuemax')).toBe('4');
    expect(screen.getByText('1 de 4 fases')).toBeTruthy();
    expect(screen.getByText('Sem atividade')).toBeTruthy();
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/c/client-1',
      '/c/client-2',
    ]);
  });

  it('the upcoming block lists meetings, calls and deadlines and links to the calendar', () => {
    const upcoming: AgendaItem[] = [
      {
        kind: 'meeting',
        id: 'meeting-1',
        title: 'Kickoff do site',
        clientId: 'client-1',
        clientName: 'Atlas Lda',
        projectId: 'project-1',
        allDay: false,
        day: '2026-10-13',
        startsAt: '2026-10-13T09:00:00.000Z',
        endsAt: '2026-10-13T10:00:00.000Z',
        href: null,
      },
      {
        kind: 'call',
        id: 'call-1',
        title: 'Bloom',
        clientId: 'client-2',
        clientName: 'Bloom',
        projectId: null,
        allDay: false,
        day: '2026-10-14',
        startsAt: '2026-10-14T10:00:00.000Z',
        endsAt: '2026-10-14T10:45:00.000Z',
        href: '/pipeline/deal-1',
      },
      {
        kind: 'delivery',
        id: 'project-1',
        title: 'Website',
        clientId: 'client-1',
        clientName: 'Atlas Lda',
        projectId: 'project-1',
        allDay: true,
        day: '2026-10-16',
        startsAt: null,
        endsAt: null,
        href: '/c/client-1',
      },
    ];
    renderWithIntl(<UpcomingEvents items={upcoming} />);

    expect(screen.getByRole('link', { name: /Kickoff do site/ }).getAttribute('href')).toBe(
      '/calendar?view=week&date=2026-10-13',
    );
    expect(screen.getByRole('link', { name: /Chamada com Bloom/ }).getAttribute('href')).toBe(
      '/pipeline/deal-1',
    );
    expect(screen.getByRole('link', { name: /Entrega · Website/ }).getAttribute('href')).toBe(
      '/c/client-1',
    );
    expect(screen.getByRole('link', { name: 'Ver calendário' }).getAttribute('href')).toBe(
      '/calendar',
    );
    cleanup();
    renderWithIntl(<UpcomingEvents items={[]} />);
    expect(screen.getByText('Sem eventos nos próximos 7 dias.')).toBeTruthy();
  });
});
