// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { ProposalHomeCard, type ProposalCardState } from './portal-cards';

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

function renderCard(state: ProposalCardState) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages}>
      <ProposalHomeCard state={state} />
    </NextIntlClientProvider>,
  );
}

describe('ProposalHomeCard', () => {
  it('invites the decision maker to choose an option', () => {
    renderCard({ kind: 'open' });

    expect(screen.getByRole('link', { name: 'Ver a proposta' }).getAttribute('href')).toBe(
      '/portal/proposal',
    );
  });

  it('tells the decision maker that the proposal expired', () => {
    renderCard({ kind: 'expired' });

    expect(screen.getByText('A proposta expirou')).toBeTruthy();
    expect(screen.getByText('Fale connosco para receber uma nova proposta.')).toBeTruthy();
  });

  it('shows where the contract stands', () => {
    renderCard({ kind: 'contract', contractId: 'contract-1', stage: 'to_sign' });
    expect(screen.getByText('O contrato está pronto a assinar.')).toBeTruthy();
    cleanup();

    renderCard({ kind: 'contract', contractId: 'contract-1', stage: 'waiting_studio' });
    expect(screen.getByText('Já assinou. Falta a assinatura da Aurion.')).toBeTruthy();
    cleanup();

    renderCard({ kind: 'contract', contractId: 'contract-1', stage: 'signed' });
    expect(screen.getByText('O contrato está assinado.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Abrir o contrato' }).getAttribute('href')).toBe(
      '/portal/contracts/contract-1',
    );
  });
});
