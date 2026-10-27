// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { MotionProvider } from '@agency-os/ui/motion';
import type { ClientResultsView } from '@/modules/results';
import { ResultsTable, type ResultsActions } from './results-table';

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

const VIEW: ClientResultsView = {
  currentMonth: '2026-10-01',
  kpis: [
    {
      id: 'kpi-sessions',
      name: 'Sessions',
      format: 'number',
      aggregation: 'sum',
      source: 'GA4',
      target: 12000,
      clientVisible: true,
      values: [{ month: '2026-09-01', value: 10010 }],
    },
  ],
};

function show(actions: ResultsActions) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <MotionProvider>
        <ResultsTable clientId="client-1" view={VIEW} actions={actions} />
      </MotionProvider>
    </NextIntlClientProvider>,
  );
}

function actions(): ResultsActions {
  return {
    saveKpi: vi.fn().mockResolvedValue({ ok: true }),
    archiveKpi: vi.fn().mockResolvedValue({ ok: true }),
    recordValues: vi.fn().mockResolvedValue({ ok: true, count: 1 }),
  };
}

describe('ResultsTable', () => {
  it('records a month value typed in place with a decimal comma', async () => {
    const spy = actions();
    show(spy);

    const table = screen.getByRole('table', { name: 'Indicadores por mês' });
    expect(within(table).getByText('10 010')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Sessions em outubro' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Sessions em outubro' }),
      '12410,5{Enter}',
    );

    expect(spy.recordValues).toHaveBeenCalledWith({
      clientId: 'client-1',
      origin: 'manual',
      values: [{ kpiId: 'kpi-sessions', month: '2026-10-01', value: 12410.5 }],
    });
  });

  it('imports a CSV: the matching column is linked, reviewed and saved as monthly totals', async () => {
    const spy = actions();
    show(spy);

    await userEvent.click(screen.getByRole('button', { name: 'Importar CSV' }));
    const file = new File(
      ['Date,Sessions,Users\n2026-09-29,100,1\n2026-10-01,200,2\n2026-10-02,50,3\n'],
      'ga4.csv',
      { type: 'text/csv' },
    );
    await userEvent.upload(screen.getByLabelText('Escolher ficheiro CSV'), file);

    expect(await screen.findByText('3 linhas · fonte detetada: CSV')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Rever 2 valores →' }));

    const review = screen.getByRole('region', { name: 'Sessions' });
    expect(within(review).getByText('250')).toBeTruthy();
    expect(within(review).getByText('substitui 10 010')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Guardar valores' }));
    expect(spy.recordValues).toHaveBeenCalledWith({
      clientId: 'client-1',
      origin: 'csv',
      values: [
        { kpiId: 'kpi-sessions', month: '2026-09-01', value: 100 },
        { kpiId: 'kpi-sessions', month: '2026-10-01', value: 250 },
      ],
    });
  });
});
