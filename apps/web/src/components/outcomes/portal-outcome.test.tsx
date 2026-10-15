// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { PortalOutcomeView } from '@/modules/outcomes';
import { PortalOutcome } from './portal-outcome';

afterEach(() => {
  cleanup();
});

const VIEW: PortalOutcomeView = {
  outcome: {
    id: 'outcome-1',
    projectId: 'project-1',
    metric: 'Leads por mês',
    unit: 'leads',
    baseline: 40,
    target: 60,
    deadline: '2026-12-31',
    dataSource: 'Google Analytics',
    guarantee: { status: 'active', reason: null, activatedOn: '2027-01-02', monthsUsed: 1 },
  },
  conditions: [
    {
      id: 'condition-access',
      kind: 'access',
      description: 'Acessos entregues em 5 dias úteis',
      status: 'met',
      recordedOn: '2026-10-02',
    },
    {
      id: 'condition-media',
      kind: 'media_budget',
      description: 'Orçamento de media acordado',
      status: 'pending',
      recordedOn: null,
    },
  ],
  measurements: [
    { measuredOn: '2026-09-15', value: 45 },
    { measuredOn: '2026-10-15', value: 52 },
  ],
};

describe('P-10 outcome', () => {
  it('the client sees the outcome, its conditions and the guarantee', () => {
    render(
      <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
        <PortalOutcome view={VIEW} />
      </NextIntlClientProvider>,
    );
    const section = screen.getByRole('region', { name: 'Resultado acordado' });
    expect(
      within(section).getByRole('img', {
        name: 'Evolução de Leads por mês: de 40 para a meta 60',
      }),
    ).toBeTruthy();
    expect(within(section).getByText('52')).toBeTruthy();
    expect(within(section).getByText('Cumprida a 2 de outubro de 2026')).toBeTruthy();
    expect(within(section).getByText('Por registar')).toBeTruthy();
    expect(
      within(section).getByText('Ativada a 2 de janeiro de 2027 · 1 de 3 meses usados'),
    ).toBeTruthy();
    expect(within(section).queryByRole('button')).toBeNull();
  });
});
