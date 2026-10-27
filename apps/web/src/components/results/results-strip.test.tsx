// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { MotionProvider } from '@agency-os/ui/motion';
import { ResultsStrip, type StripKpi } from './results-strip';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});

afterEach(cleanup);

const KPIS: StripKpi[] = [
  {
    id: 'traffic',
    name: 'Tráfego orgânico',
    format: 'number',
    target: 12000,
    values: [
      { month: '2026-09-01', value: 10010 },
      { month: '2026-10-01', value: 12410 },
    ],
  },
  {
    id: 'roas',
    name: 'ROAS',
    format: 'ratio',
    target: null,
    values: [
      { month: '2026-09-01', value: 4.5 },
      { month: '2026-10-01', value: 4.2 },
    ],
  },
  { id: 'leads', name: 'Leads', format: 'number', target: 160, values: [] },
];

function show(node: React.ReactNode) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <MotionProvider>{node}</MotionProvider>
    </NextIntlClientProvider>,
  );
}

describe('ResultsStrip', () => {
  it('shows each indicator with its month value, change and target', () => {
    show(<ResultsStrip kpis={KPIS} currentMonth="2026-10-01" href="/c/client-1/results" />);

    const traffic = screen.getByRole('group', { name: 'Tráfego orgânico' });
    expect(within(traffic).getByText('12 410')).toBeTruthy();
    expect(within(traffic).getByText('subiu 24%')).toBeTruthy();
    expect(within(traffic).getByText(/Objetivo 12 000 · atingido/)).toBeTruthy();

    const roas = screen.getByRole('group', { name: 'ROAS' });
    expect(within(roas).getByText('4,2×')).toBeTruthy();
    expect(within(roas).getByText('desceu 0,3')).toBeTruthy();

    const leads = screen.getByRole('group', { name: 'Leads' });
    expect(within(leads).getByText('Sem valor este mês')).toBeTruthy();

    expect(screen.getByRole('link', { name: 'Abrir resultados' }).getAttribute('href')).toBe(
      '/c/client-1/results',
    );
  });

  it('invites the team to define indicators and stays hidden for the client', () => {
    show(<ResultsStrip kpis={[]} currentMonth="2026-10-01" emptyHref="/c/client-1/results" />);
    expect(screen.getByRole('link', { name: 'Definir indicadores' })).toBeTruthy();

    cleanup();
    show(<ResultsStrip kpis={[]} currentMonth="2026-10-01" />);
    expect(screen.queryByText('Definir indicadores')).toBeNull();
    expect(screen.queryByRole('region')).toBeNull();
  });
});
