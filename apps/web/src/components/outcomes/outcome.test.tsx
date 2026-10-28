// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { GuaranteeView, StaffOutcomeView } from '@/modules/outcomes';
import { GuaranteeCard } from './guarantee-card';
import { OutcomeChart } from './outcome-chart';
import { OutcomeScreen, type OutcomeActions } from './outcome-screen';

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

const PENDING: GuaranteeView = {
  status: 'pending',
  reason: null,
  activatedOn: null,
  monthsUsed: 0,
};

function view(overrides: Partial<StaffOutcomeView> = {}): StaffOutcomeView {
  return {
    canWrite: true,
    projects: [{ id: 'project-1', name: 'Website' }],
    proposalGuarantee: 'Se a meta não for atingida, até 3 meses de trabalho sem custo.',
    outcome: {
      id: 'outcome-1',
      projectId: 'project-1',
      metric: 'Leads por mês',
      unit: 'leads',
      baseline: 40,
      target: 60,
      deadline: '2026-12-31',
      dataSource: 'Google Analytics',
      guarantee: PENDING,
    },
    conditions: [
      {
        id: 'condition-access',
        kind: 'access',
        description: 'Acessos entregues em 5 dias úteis',
        status: 'met',
        recordedOn: '2026-10-02',
        note: null,
      },
      {
        id: 'condition-approvals',
        kind: 'approvals',
        description: 'Aprovações dentro do prazo',
        status: 'pending',
        recordedOn: null,
        note: null,
      },
    ],
    measurements: [
      { measuredOn: '2026-09-15', value: 45, note: null },
      { measuredOn: '2026-10-15', value: 52, note: 'Campanha de outono' },
    ],
    ...overrides,
  };
}

function actions(): OutcomeActions & Record<keyof OutcomeActions, ReturnType<typeof vi.fn>> {
  return {
    save: vi.fn(async () => ({ ok: true as const })),
    addCondition: vi.fn(async () => ({ ok: true as const })),
    recordCondition: vi.fn(async () => ({ ok: true as const })),
    recordMeasurement: vi.fn(async () => ({ ok: true as const })),
  };
}

describe('C-11 outcome', () => {
  it('the chart is described and its values are in a table', () => {
    withIntl(
      <OutcomeChart
        metric="Leads por mês"
        unit="leads"
        baseline={40}
        target={60}
        measurements={view().measurements}
      />,
    );
    expect(
      screen.getByRole('img', { name: 'Evolução de Leads por mês: de 40 para a meta 60' }),
    ).toBeTruthy();
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByText('45')).toBeTruthy();
    expect(within(table).getByText('52')).toBeTruthy();
  });

  it('writers create and edit the outcome', async () => {
    const run = actions();
    withIntl(
      <OutcomeScreen
        clientId="client-1"
        view={view({ outcome: null, conditions: [], measurements: [] })}
        actions={run}
      />,
    );
    fireEvent.change(screen.getByLabelText('Métrica'), { target: { value: 'Leads por mês' } });
    fireEvent.change(screen.getByLabelText('Unidade'), { target: { value: 'leads' } });
    fireEvent.change(screen.getByLabelText('Linha de base'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Meta'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('Prazo'), { target: { value: '2026-12-31' } });
    fireEvent.change(screen.getByLabelText('Fonte dos dados'), {
      target: { value: 'Google Analytics' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar resultado' }));
    await screen.findByText('Resultado guardado.');
    expect(run.save).toHaveBeenCalledWith({
      clientId: 'client-1',
      projectId: 'project-1',
      metric: 'Leads por mês',
      unit: 'leads',
      baseline: '40',
      target: '60',
      deadline: '2026-12-31',
      dataSource: 'Google Analytics',
    });
  });

  it('conditions are marked met or failed, a failure asks for a note', async () => {
    const run = actions();
    withIntl(<OutcomeScreen clientId="client-1" view={view()} actions={run} />);
    const conditions = screen.getByRole('region', { name: 'Condições do cliente' });
    const approvals = within(conditions)
      .getAllByRole('listitem')
      .find((item) => item.textContent?.includes('Aprovações dentro do prazo')) as HTMLElement;
    expect(within(conditions).getByText('Por registar')).toBeTruthy();

    fireEvent.click(within(approvals).getByRole('button', { name: 'Falhou' }));
    fireEvent.click(within(approvals).getByRole('button', { name: 'Guardar' }));
    const alert = await screen.findByText('Explique o que falhou.');
    expect(run.recordCondition).not.toHaveBeenCalled();
    const noteField = within(approvals).getByLabelText('Nota');
    expect(noteField.getAttribute('aria-invalid')).toBe('true');
    expect(noteField.getAttribute('aria-describedby')).toContain(alert.id);
    await waitFor(() => expect(document.activeElement).toBe(noteField));
    fireEvent.change(within(approvals).getByLabelText('Nota'), {
      target: { value: 'Duas aprovações com uma semana de atraso' },
    });
    fireEvent.click(within(approvals).getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Condição registada.');
    expect(run.recordCondition).toHaveBeenCalledWith({
      conditionId: 'condition-approvals',
      status: 'failed',
      note: 'Duas aprovações com uma semana de atraso',
    });

    const met = within(approvals).getByRole('button', { name: 'Cumprida' });
    await waitFor(() => expect(met.hasAttribute('disabled')).toBe(false));
    fireEvent.click(met);
    await waitFor(() => expect(run.recordCondition).toHaveBeenCalledTimes(2));
    expect(run.recordCondition).toHaveBeenLastCalledWith({
      conditionId: 'condition-approvals',
      status: 'met',
    });
  });

  it('values are recorded by date', async () => {
    const run = actions();
    withIntl(<OutcomeScreen clientId="client-1" view={view()} actions={run} />);
    const evolution = screen.getByRole('region', { name: 'Evolução' });
    fireEvent.change(within(evolution).getByLabelText('Data'), {
      target: { value: '2026-01-10' },
    });
    fireEvent.change(within(evolution).getByLabelText('Valor'), { target: { value: '55,5' } });
    fireEvent.click(within(evolution).getByRole('button', { name: 'Registar' }));
    await screen.findByText('Valor registado.');
    expect(run.recordMeasurement).toHaveBeenCalledWith({
      outcomeId: 'outcome-1',
      measuredOn: '2026-01-10',
      value: '55.5',
      note: '',
    });
  });

  it('a passed deadline waits for the client conditions instead of naming a past date', () => {
    withIntl(<GuaranteeCard guarantee={PENDING} deadline="2020-01-31" />);
    expect(
      screen.getByText(
        'O prazo terminou a 31 de janeiro de 2020: falta registar as condições do cliente.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/^Por decidir até/)).toBeNull();
  });

  it('the guarantee card states each status', () => {
    const states: [GuaranteeView, string][] = [
      [PENDING, 'Por decidir até 31 de dezembro de 2026'],
      [
        { status: 'not_activated', reason: 'target_met', activatedOn: null, monthsUsed: 0 },
        'Não ativada: a meta foi atingida',
      ],
      [
        { status: 'not_activated', reason: 'conditions_failed', activatedOn: null, monthsUsed: 0 },
        'Não ativada: uma condição do cliente falhou',
      ],
      [
        { status: 'active', reason: null, activatedOn: '2027-01-02', monthsUsed: 1 },
        'Ativada a 2 de janeiro de 2027 · 1 de 3 meses usados',
      ],
      [
        { status: 'closed', reason: 'target_met', activatedOn: '2027-01-02', monthsUsed: 2 },
        'Encerrada: a meta foi atingida',
      ],
      [
        { status: 'closed', reason: 'months_used', activatedOn: '2027-01-02', monthsUsed: 3 },
        'Encerrada: os 3 meses foram usados',
      ],
    ];
    for (const [guarantee, text] of states) {
      const { unmount } = withIntl(<GuaranteeCard guarantee={guarantee} deadline="2026-12-31" />);
      expect(screen.getByText(text)).toBeTruthy();
      unmount();
    }
  });

  it('readers without write see no forms', () => {
    withIntl(
      <OutcomeScreen clientId="client-1" view={view({ canWrite: false })} actions={actions()} />,
    );
    expect(screen.queryByRole('button', { name: 'Registar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cumprida' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar resultado' })).toBeNull();
    expect(screen.getByText('Cumprida a 2 de outubro de 2026')).toBeTruthy();
  });
});
