// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { PortalProposal } from '@/modules/contracts/server';
import { ProposalAcceptance, type AcceptanceActions } from './proposal-acceptance';

const push = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  push.mockReset();
});

const PROPOSAL: PortalProposal = {
  id: 'proposal-1',
  status: 'sent',
  currency: 'EUR',
  locale: 'pt-PT',
  validUntil: '2099-12-31',
  guarantee: 'Garantia de 30 dias',
  entityName: 'Aurion Creative Lda',
  sentAt: new Date('2026-10-09T10:00:00Z'),
  acceptedOptionId: null,
  contractId: null,
  contractStatus: null,
  contractClientSigned: false,
  expired: false,
  options: [
    {
      id: 'option-1',
      position: 1,
      name: 'Orbit essencial',
      summary: 'O essencial',
      scope: [{ text: 'Novo site', findingId: null }],
      oneOffAmount: '6000.00',
      paymentPlan: [{ label: 'Assinatura', percent: 100 }],
      retainerMonthly: null,
      retainerMonths: null,
    },
    {
      id: 'option-2',
      position: 2,
      name: 'Orbit com Gravity',
      summary: 'Com ativação',
      scope: [{ text: 'Novo site e campanhas', findingId: null }],
      oneOffAmount: '12000.00',
      paymentPlan: [
        { label: 'Assinatura', percent: 50 },
        { label: 'Entrega', percent: 50 },
      ],
      retainerMonthly: '1500.00',
      retainerMonths: 12,
    },
  ],
};

function actions(): AcceptanceActions {
  return {
    accept: vi.fn(async () => ({ ok: true as const, contractId: 'contract-1' })),
    requestChanges: vi.fn(async () => ({ ok: true as const })),
  };
}

function renderAcceptance(proposal: PortalProposal, acceptanceActions = actions()) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages}>
      <ProposalAcceptance proposal={proposal} actions={acceptanceActions} />
    </NextIntlClientProvider>,
  );
  return acceptanceActions;
}

function fillDetails() {
  const fields: Array<[string, string]> = [
    ['Denominação da empresa', 'Empresa Cliente SA'],
    ['NIF', '500100200'],
    ['Morada da sede', 'Rua do Cliente, Porto'],
    ['O seu nome completo', 'Ana Costa'],
    ['O seu cargo', 'Administradora'],
  ];
  for (const [label, value] of fields) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}

describe('ProposalAcceptance', () => {
  it('accepts the chosen option with the company details', async () => {
    const acceptanceActions = renderAcceptance(PROPOSAL);
    fireEvent.click(screen.getByRole('radio', { name: /Orbit com Gravity/ }));
    fillDetails();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Aceitar proposta e preparar contrato' }));
    });

    expect(acceptanceActions.accept).toHaveBeenCalledWith({
      proposalId: 'proposal-1',
      optionId: 'option-2',
      company: {
        legalName: 'Empresa Cliente SA',
        taxId: '500100200',
        address: 'Rua do Cliente, Porto',
      },
      signer: { name: 'Ana Costa', role: 'Administradora' },
    });
    expect(push).toHaveBeenCalledWith('/portal/contracts/contract-1');
  });

  it('asks for an option before accepting', async () => {
    const acceptanceActions = renderAcceptance(PROPOSAL);
    fillDetails();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Aceitar proposta e preparar contrato' }));
    });

    expect(acceptanceActions.accept).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Escolha uma opção.');
  });

  it('sends a change request', async () => {
    const acceptanceActions = renderAcceptance(PROPOSAL);
    fireEvent.change(screen.getByLabelText('O que quer mudar'), {
      target: { value: 'Podemos dividir em três pagamentos?' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    });

    expect(acceptanceActions.requestChanges).toHaveBeenCalledWith(
      'proposal-1',
      'Podemos dividir em três pagamentos?',
    );
    expect(screen.getByRole('status').textContent).toBe('Pedido enviado. Respondemos em breve.');
  });

  it('shows the expiry instead of the form', () => {
    renderAcceptance({ ...PROPOSAL, expired: true, validUntil: '2020-01-01' });

    expect(
      screen.queryByRole('button', { name: 'Aceitar proposta e preparar contrato' }),
    ).toBeNull();
    expect(screen.getByText(/Esta proposta expirou/)).toBeTruthy();
  });
});
