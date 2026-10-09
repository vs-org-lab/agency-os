// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { ProposalWorkspace } from '@/modules/contracts/server';
import { ProposalSection, type ProposalActions } from './proposal-section';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// Radix form controls measure themselves with ResizeObserver, which jsdom lacks.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

afterEach(() => {
  cleanup();
});

const WORKSPACE: ProposalWorkspace = {
  dealId: 'deal-1',
  stage: '1.6',
  portalAccess: true,
  proposal: null,
  findings: [{ id: 'finding-1', title: 'Sem rastreamento', front: 'gravity' }],
  entities: [{ id: 'entity-1', legalName: 'Aurion Creative Lda', isDefault: true }],
  defaults: { currency: 'EUR', locale: 'pt-PT' },
};

function actions(): ProposalActions {
  return {
    save: vi.fn(async () => ({ ok: true as const, proposalId: 'proposal-1' })),
    send: vi.fn(async () => ({ ok: true as const })),
    withdraw: vi.fn(async () => ({ ok: true as const })),
  };
}

function renderSection(workspace: ProposalWorkspace, proposalActions = actions(), founder = true) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages}>
      <ProposalSection workspace={workspace} founder={founder} actions={proposalActions} />
    </NextIntlClientProvider>,
  );
  return proposalActions;
}

describe('ProposalSection', () => {
  it('saves the three Orbit options with their amounts', async () => {
    const proposalActions = renderSection(WORKSPACE);
    const amounts = screen.getAllByLabelText('Valor único');
    const scopes = screen.getAllByLabelText('Linha do âmbito 1');
    amounts.forEach((field, index) => {
      fireEvent.change(field, { target: { value: String((index + 1) * 6000) } });
    });
    scopes.forEach((field) => {
      fireEvent.change(field, { target: { value: 'Novo site institucional' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar rascunho' }));
    });

    expect(proposalActions.save).toHaveBeenCalledTimes(1);
    const [input] = vi.mocked(proposalActions.save).mock.calls[0] ?? [];
    expect(input?.options.map((option) => [option.name, option.oneOffAmount])).toEqual([
      ['Orbit essencial', '6000'],
      ['Orbit com Gravity', '12000'],
      ['Sistema completo com Constellation', '18000'],
    ]);
    expect(input?.legalEntityId).toBe('entity-1');
  });

  it('adds a finding of the 90 day lane to the scope', () => {
    renderSection(WORKSPACE);

    fireEvent.change(screen.getAllByLabelText('Acrescentar achado')[0] as HTMLSelectElement, {
      target: { value: 'finding-1' },
    });

    expect((screen.getAllByLabelText('Linha do âmbito 1')[0] as HTMLInputElement).value).toBe(
      'Sem rastreamento',
    );
  });

  it('refuses payments that do not add up to 100', async () => {
    const proposalActions = renderSection(WORKSPACE);
    for (const field of screen.getAllByLabelText('Valor único')) {
      fireEvent.change(field, { target: { value: '6000' } });
    }
    fireEvent.change(
      screen.getAllByLabelText('Percentagem do pagamento 1')[0] as HTMLInputElement,
      {
        target: { value: '60' },
      },
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar rascunho' }));
    });

    expect(proposalActions.save).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(
      'Os pagamentos de cada opção têm de somar 100%.',
    );
  });

  it('shows a read only summary once sent', () => {
    renderSection({
      ...WORKSPACE,
      proposal: {
        id: 'proposal-1',
        status: 'sent',
        legalEntityId: 'entity-1',
        currency: 'EUR',
        locale: 'pt-PT',
        validUntil: '2099-12-31',
        guarantee: 'Garantia',
        sentAt: new Date('2026-10-09T10:00:00Z'),
        acceptedAt: null,
        acceptedOptionId: null,
        options: [
          {
            id: 'option-1',
            position: 1,
            name: 'Orbit essencial',
            summary: 'Resumo',
            scope: [{ text: 'Novo site', findingId: null }],
            oneOffAmount: '6000.00',
            paymentPlan: [{ label: 'Assinatura', percent: 100 }],
            retainerMonthly: null,
            retainerMonths: null,
          },
        ],
        requests: [],
      },
    });

    expect(screen.queryByRole('button', { name: 'Guardar rascunho' })).toBeNull();
    expect(screen.getByText('Enviada ao cliente')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retirar proposta' })).toBeTruthy();
  });

  it('flags a sent proposal past its validity', () => {
    renderSection({ ...WORKSPACE, proposal: { ...SENT, validUntil: '2020-01-01' } });

    expect(screen.getByText('Expirada')).toBeTruthy();
    expect(
      screen.getByText('A validade terminou. Retire a proposta, mude a data e envie-a de novo.'),
    ).toBeTruthy();
  });

  it('keeps the client change requests in view while editing the draft', () => {
    renderSection({
      ...WORKSPACE,
      proposal: {
        ...SENT,
        status: 'draft',
        sentAt: null,
        requests: [
          {
            id: 'request-1',
            message: 'Podemos dividir em três pagamentos?',
            createdAt: new Date('2026-10-09T10:00:00Z'),
          },
        ],
      },
    });

    expect(screen.getByRole('button', { name: 'Guardar rascunho' })).toBeTruthy();
    expect(screen.getByText('Podemos dividir em três pagamentos?')).toBeTruthy();
  });

  it('removes an option, accepts comma decimals and drops empty scope lines', async () => {
    const proposalActions = renderSection(WORKSPACE);
    fireEvent.click(screen.getByRole('button', { name: 'Remover opção 3' }));
    const [first, second] = screen.getAllByLabelText('Valor único');
    fireEvent.change(first as HTMLInputElement, { target: { value: '6000,50' } });
    fireEvent.change(second as HTMLInputElement, { target: { value: '12000' } });
    for (const line of screen.getAllByLabelText('Linha do âmbito 1')) {
      fireEvent.change(line, { target: { value: 'Novo site' } });
    }
    fireEvent.click(screen.getAllByRole('button', { name: 'Acrescentar linha' })[0] as HTMLElement);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar rascunho' }));
    });

    const [input] = vi.mocked(proposalActions.save).mock.calls[0] ?? [];
    expect(input?.options).toHaveLength(2);
    expect(input?.options[0]?.oneOffAmount).toBe('6000.50');
    expect(input?.options[0]?.scope).toEqual([{ text: 'Novo site', findingId: null }]);
  });

  it('adds and removes the monthly retainer of an option', async () => {
    const proposalActions = renderSection(WORKSPACE);
    for (const field of screen.getAllByLabelText('Valor único')) {
      fireEvent.change(field, { target: { value: '6000' } });
    }
    for (const line of screen.getAllByLabelText('Linha do âmbito 1')) {
      fireEvent.change(line, { target: { value: 'Novo site' } });
    }
    const [firstRetainer, secondRetainer] = screen.getAllByRole('checkbox', {
      name: 'Inclui acompanhamento mensal',
    });
    fireEvent.click(firstRetainer as HTMLElement);
    fireEvent.change(screen.getByLabelText('Valor mensal'), { target: { value: '1500' } });
    fireEvent.click(secondRetainer as HTMLElement);
    fireEvent.click(secondRetainer as HTMLElement);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar rascunho' }));
    });

    const [input] = vi.mocked(proposalActions.save).mock.calls[0] ?? [];
    expect(input?.options[0]).toMatchObject({ retainerMonthly: '1500', retainerMonths: 12 });
    expect(input?.options[1]).toMatchObject({ retainerMonthly: null, retainerMonths: null });
  });
});

const SENT: NonNullable<ProposalWorkspace['proposal']> = {
  id: 'proposal-1',
  status: 'sent',
  legalEntityId: 'entity-1',
  currency: 'EUR',
  locale: 'pt-PT',
  validUntil: '2099-12-31',
  guarantee: 'Garantia',
  sentAt: new Date('2026-10-09T10:00:00Z'),
  acceptedAt: null,
  acceptedOptionId: null,
  options: [
    {
      id: 'option-1',
      position: 1,
      name: 'Orbit essencial',
      summary: 'Resumo',
      scope: [{ text: 'Novo site', findingId: null }],
      oneOffAmount: '6000.00',
      paymentPlan: [{ label: 'Assinatura', percent: 100 }],
      retainerMonthly: null,
      retainerMonths: null,
    },
  ],
  requests: [],
};
