// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { clientColor, weekDays, type AgendaItem } from '@/modules/agenda';
import { AgendaCalendar, type AgendaActions } from './agenda-calendar';
import { CLIENT_COLORS } from './agenda-colors';
import { agendaPeriod } from './agenda-period';
import { ListView } from './list-view';
import { MonthView } from './month-view';
import { WeekView } from './week-view';

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

const CLIENT = '3f2b8c1e-7d4a-4c6e-9b1a-2e5f8d7c6b4a';

function meetingItem(overrides: Partial<AgendaItem> = {}): AgendaItem {
  return {
    kind: 'meeting',
    id: 'meeting-1',
    title: 'Kickoff do site',
    clientId: CLIENT,
    clientName: 'Atlas Lda',
    projectId: null,
    allDay: false,
    day: '2026-10-25',
    startsAt: '2026-10-24T23:30:00.000Z',
    endsAt: '2026-10-25T00:30:00.000Z',
    href: null,
    meeting: {
      kind: 'meeting',
      notes: '',
      location: '',
      meetUrl: null,
      inviteClient: false,
      syncStatus: 'synced',
      editable: true,
    },
    ...overrides,
  };
}

const deadline: AgendaItem = {
  kind: 'delivery',
  id: 'project-1',
  title: 'Website',
  clientId: CLIENT,
  clientName: 'Atlas Lda',
  projectId: 'project-1',
  allDay: true,
  day: '2026-10-27',
  startsAt: null,
  endsAt: null,
  href: '/c/client-1',
};

const actions = (): AgendaActions => ({
  schedule: vi.fn(async () => ({ ok: true as const, syncStatus: 'pending' as const })),
  update: vi.fn(async () => ({ ok: true as const })),
  cancel: vi.fn(async () => ({ ok: true as const })),
});

describe('agenda', () => {
  it('the month view places items on their Lisbon day with the client colour', () => {
    withIntl(
      <MonthView
        month="2026-10"
        today="2026-10-12"
        items={[meetingItem()]}
        canSchedule={false}
        onDay={vi.fn()}
        onItem={vi.fn()}
      />,
    );
    const cell = screen.getByRole('gridcell', { name: /25/ });
    const item = within(cell).getByRole('button', { name: /Kickoff do site/ });
    const probe = document.createElement('span');
    probe.style.borderLeftColor = CLIENT_COLORS[clientColor(CLIENT)] ?? '';
    expect(item.style.borderLeftColor).toBe(probe.style.borderLeftColor);
    expect(within(screen.getByRole('gridcell', { name: /24/ })).queryByText(/Kickoff/)).toBeNull();
  });

  it('the week view shows busy blocks without details', () => {
    withIntl(
      <WeekView
        days={weekDays('2026-10-12')}
        today="2026-10-12"
        items={[]}
        busy={[{ start: '2026-10-13T09:00:00.000Z', end: '2026-10-13T10:30:00.000Z' }]}
        canSchedule={false}
        onDay={vi.fn()}
        onItem={vi.fn()}
      />,
    );
    expect(screen.getByText('Ocupado, 10:00–11:30')).toBeTruthy();
    expect(screen.getAllByRole('columnheader')).toHaveLength(7);
  });

  it('the list view groups the next 30 days', () => {
    withIntl(<ListView items={[meetingItem(), deadline]} onItem={vi.fn()} />);
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2);
    expect(screen.getByRole('link', { name: /Website/ }).getAttribute('href')).toBe('/c/client-1');
  });

  it('the empty state says there are no events', () => {
    withIntl(<ListView items={[]} onItem={vi.fn()} />);
    expect(screen.getByText('Sem eventos')).toBeTruthy();
  });

  it('clicking a day opens a new meeting on that date', () => {
    withIntl(
      <AgendaCalendar
        view="month"
        date="2026-10-12"
        today="2026-10-12"
        basePath="/calendar"
        items={[]}
        busy={[]}
        canSchedule
        clients={[{ id: CLIENT, name: 'Atlas Lda' }]}
        projects={[]}
        fixedClientId={null}
        actions={actions()}
      />,
    );
    expect(screen.getByRole('link', { name: 'Semana' }).getAttribute('href')).toBe(
      '/calendar?view=week&date=2026-10-12',
    );
    fireEvent.click(screen.getByRole('button', { name: /Nova reunião a 13/ }));
    expect(screen.getByRole('dialog', { name: 'Nova reunião' })).toBeTruthy();
    expect((screen.getByLabelText('Data') as HTMLInputElement).value).toBe('2026-10-13');
  });

  it('periods cover the month grid, the week and the next 30 days', () => {
    expect(agendaPeriod({ view: 'month', date: '2026-10-12' }, '2026-10-12')).toEqual({
      view: 'month',
      date: '2026-10-12',
      from: '2026-09-28',
      to: '2026-11-01',
    });
    expect(agendaPeriod({ view: 'week', date: '2026-10-14' }, '2026-10-12')).toMatchObject({
      from: '2026-10-12',
      to: '2026-10-18',
    });
    expect(agendaPeriod({}, '2026-10-12')).toMatchObject({ view: 'month', date: '2026-10-12' });
    expect(agendaPeriod({ view: 'list', date: 'nonsense' }, '2026-10-12')).toEqual({
      view: 'list',
      date: '2026-10-12',
      from: '2026-10-12',
      to: '2026-11-11',
    });
  });

  it('event titles render as text', () => {
    const { container } = withIntl(
      <ListView
        items={[meetingItem({ title: '<b>Reunião</b><script>alert(1)</script>' })]}
        onItem={vi.fn()}
      />,
    );
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('<b>Reunião</b><script>alert(1)</script>')).toBeTruthy();
  });
});
