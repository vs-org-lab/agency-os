// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { ClientHealthView } from '@/modules/health';
import { HealthCard } from './health-card';

afterEach(() => {
  cleanup();
});

function show(health: ClientHealthView) {
  return render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <HealthCard health={health} />
    </NextIntlClientProvider>,
  );
}

const FULL: ClientHealthView = {
  score: 78,
  trend: null,
  level: 'healthy',
  signals: {
    payments: { score: 50, detail: { kind: 'payments', onTime: 1, total: 2 } },
    approvals: { score: 64, detail: { kind: 'approvals', medianDays: 7 } },
    responses: { score: 96, detail: { kind: 'responses', medianHours: 30.4 } },
    outcome: { score: 100, detail: { kind: 'outcome', progress: 0.5, expected: 0.5 } },
  },
};

const EMPTY: ClientHealthView = {
  score: null,
  trend: null,
  level: null,
  signals: { payments: null, approvals: null, responses: null, outcome: null },
};

describe('C-01 health card', () => {
  it('the card shows the score, the level and each signal', () => {
    show(FULL);
    const card = screen.getByRole('region', { name: 'Saúde' });
    expect(within(card).getByRole('heading', { level: 2, name: 'Saúde' })).toBeTruthy();
    expect(within(card).getByText('78 de 100')).toBeTruthy();
    expect(within(card).getByText('Saudável')).toBeTruthy();
    expect(within(card).getByText('Pagamentos em dia')).toBeTruthy();
    expect(within(card).getByText('1 de 2 pedidos pagos a tempo')).toBeTruthy();
    expect(within(card).getByText('Mediana de 7 dias')).toBeTruthy();
    expect(within(card).getByText('Mediana de 30 horas')).toBeTruthy();
    expect(within(card).getByText('50% da meta com 50% do tempo')).toBeTruthy();
  });

  it('the card shows the trend over 30 days', () => {
    for (const [trend, text] of [
      [5, '+5 nos últimos 30 dias'],
      [-12, '−12 nos últimos 30 dias'],
      [0, 'Sem variação nos últimos 30 dias'],
    ] as const) {
      const { unmount } = show({ ...FULL, trend });
      expect(screen.getByText(text)).toBeTruthy();
      unmount();
    }
    show({ ...FULL, trend: null });
    expect(screen.queryByText(/nos últimos 30 dias/)).toBeNull();
  });

  it('levels at their limits and no data', () => {
    const { unmount } = show(EMPTY);
    expect(screen.getAllByText('Sem dados')).toHaveLength(5);
    unmount();
    const at = (score: number, level: ClientHealthView['level']) => {
      const view = show({ ...EMPTY, score, level });
      return view;
    };
    const risk = at(49, 'at_risk');
    expect(screen.getByText('Em risco')).toBeTruthy();
    risk.unmount();
    const attention = at(50, 'attention');
    expect(screen.getByText('Atenção')).toBeTruthy();
    attention.unmount();
  });

  it('health messages use singular and plural', () => {
    const withSignals = (medianDays: number, medianHours: number): ClientHealthView => ({
      ...FULL,
      signals: {
        ...FULL.signals,
        approvals: { score: 64, detail: { kind: 'approvals', medianDays } },
        responses: { score: 96, detail: { kind: 'responses', medianHours } },
      },
    });
    for (const [days, hours, daysText, hoursText] of [
      [1, 1, 'Mediana de 1 dia', 'Mediana de 1 hora'],
      [2, 5, 'Mediana de 2 dias', 'Mediana de 5 horas'],
      [3, 0.4, 'Mediana de 3 dias', 'Mediana de menos de 1 hora'],
    ] as const) {
      const { unmount } = show(withSignals(days, hours));
      expect(screen.getByText(daysText)).toBeTruthy();
      expect(screen.getByText(hoursText)).toBeTruthy();
      unmount();
    }
  });
});
