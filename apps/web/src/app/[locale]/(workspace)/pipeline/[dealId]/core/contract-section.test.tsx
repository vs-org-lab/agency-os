// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { ContractView } from '@/modules/contracts/server';
import { ContractSection, type ContractSectionActions } from './contract-section';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

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
  refresh.mockReset();
});

const CONTRACT: ContractView = {
  id: 'contract-1',
  status: 'awaiting_signatures',
  locale: 'pt-PT',
  body: '# Contrato\n\nTexto.',
  bodyHash: 'a'.repeat(64),
  signedAt: null,
  pdfAvailable: false,
  clientSigner: 'Ana Costa',
  studioSigner: 'Vladimir Silva',
  signatures: [
    { party: 'client', typedName: 'Ana Costa', signedAt: new Date('2026-10-09T10:00:00Z') },
  ],
};

function renderSection(actions: ContractSectionActions, contract = CONTRACT) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages}>
      <ContractSection contract={contract} dealId="deal-1" founder actions={actions} />
    </NextIntlClientProvider>,
  );
}

describe('ContractSection', () => {
  it('voids the contract with the reason given', async () => {
    const actions: ContractSectionActions = {
      sign: vi.fn(async () => ({ ok: true as const })),
      void: vi.fn(async () => ({ ok: true as const })),
    };
    renderSection(actions);
    fireEvent.click(screen.getByRole('button', { name: 'Anular contrato' }));
    const dialog = screen.getByRole('dialog', { name: 'Anular contrato' });
    fireEvent.change(within(dialog).getByLabelText('Motivo'), {
      target: { value: 'Valor errado' },
    });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Anular contrato' }));
    });

    expect(actions.void).toHaveBeenCalledWith('contract-1', 'deal-1', 'Valor errado');
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the void dialog open when the action is refused', async () => {
    const actions: ContractSectionActions = {
      sign: vi.fn(async () => ({ ok: true as const })),
      void: vi.fn(async () => ({ ok: false as const, code: 'invalid_state' })),
    };
    renderSection(actions);
    fireEvent.click(screen.getByRole('button', { name: 'Anular contrato' }));
    const dialog = screen.getByRole('dialog', { name: 'Anular contrato' });
    fireEvent.change(within(dialog).getByLabelText('Motivo'), {
      target: { value: 'Valor errado' },
    });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Anular contrato' }));
    });

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('O contrato já não pode ser anulado.')).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('reveals the contract text from the read disclosure', () => {
    renderSection({ sign: vi.fn(), void: vi.fn() });
    expect(screen.getByText(/Texto./).closest('[hidden]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ler o contrato' }));
    expect(screen.getByText(/Texto./).closest('[hidden]')).toBeNull();
  });

  it('shows who signed and offers the studio signature', () => {
    renderSection({ sign: vi.fn(), void: vi.fn() });

    expect(screen.getByText(/Cliente: Ana Costa · assinou a/)).toBeTruthy();
    expect(screen.getByText('Aurion: Vladimir Silva · por assinar')).toBeTruthy();
    expect(screen.getByLabelText('Escreva o seu nome completo: Vladimir Silva')).toBeTruthy();
  });

  it('offers the signed PDF and no actions once signed', () => {
    renderSection(
      { sign: vi.fn(), void: vi.fn() },
      { ...CONTRACT, status: 'signed', pdfAvailable: true },
    );

    expect(
      screen
        .getByRole('link', { name: 'Descarregar o contrato assinado (PDF)' })
        .getAttribute('href'),
    ).toBe('/api/contracts/contract-1/pdf');
    expect(screen.queryByText('Anular contrato')).toBeNull();
  });
});
