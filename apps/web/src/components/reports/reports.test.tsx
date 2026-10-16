// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { ReportsView } from '@/modules/reports';
import { ReportsScreen } from './reports-screen';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
});

function show(view: ReportsView) {
  return render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <ReportsScreen view={view} />
    </NextIntlClientProvider>,
  );
}

const months = (overrides: Record<number, string>) =>
  Array.from({ length: 12 }, (_, index) => overrides[index] ?? '0.00');

const FULL: ReportsView = {
  year: 2026,
  revenue: [{ currency: 'EUR', months: months({ 9: '6000.00' }), total: '6000.00' }],
  recurring: [{ currency: 'EUR', monthly: '1500.00', retainers: 1 }],
  pipeline: [{ stage: 'core', codes: [{ code: '1.2', deals: 3 }] }],
  conversion: [
    { from: 'pre_sale', to: 'core', entered: 4, passed: 2, percent: 50 },
    { from: 'gravity', to: 'constellation', entered: 0, passed: 0, percent: null },
  ],
  load: [{ userId: 'u1', name: 'Ana Costa', tasksThisWeek: 5, activeProjects: 2, weeklyHours: 40 }],
  atRisk: [{ clientId: 'c1', name: 'Bloom', score: 30, scoreBefore: 60 }],
};

const PANELS: [string, string][] = [
  ['Receita por mês', 'revenue'],
  ['Receita recorrente', 'recurring'],
  ['Negócios por código', 'pipeline'],
  ['Conversão entre etapas', 'conversion'],
  ['Carga da equipa', 'load'],
  ['Clientes em risco', 'at-risk'],
];

describe('S-11 reports', () => {
  it('the reports screen shows each panel with its download', () => {
    show(FULL);
    expect(screen.getByRole('heading', { level: 1, name: 'Relatórios' })).toBeTruthy();
    for (const [title, panel] of PANELS) {
      const section = screen.getByRole('region', { name: title });
      const link = within(section).getByRole('link', { name: 'Descarregar CSV' });
      expect(link.getAttribute('href')).toBe(`/api/reports/${panel}.csv?year=2026`);
    }
    expect(screen.getByText('Ana Costa')).toBeTruthy();
    expect(screen.getByText('Bloom')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ano anterior' }).getAttribute('href')).toBe(
      '/reports?year=2025',
    );
  });

  it('empty panels and conversion without entries', () => {
    show({ ...FULL, revenue: [], recurring: [], pipeline: [], load: [], atRisk: [] });
    expect(
      within(screen.getByRole('region', { name: 'Receita por mês' })).getByText(
        'Sem dados neste ano.',
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'Clientes em risco' })).getByText('Sem dados.'),
    ).toBeTruthy();
    const conversion = screen.getByRole('region', { name: 'Conversão entre etapas' });
    expect(within(conversion).getByText('—')).toBeTruthy();
    expect(within(conversion).getByText('50%')).toBeTruthy();
  });
});
