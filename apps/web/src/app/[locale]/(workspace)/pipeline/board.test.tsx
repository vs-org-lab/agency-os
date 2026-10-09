// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { PipelineCard } from '@/modules/commercial';
import { Board, type MoveDeal } from './board';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
});

const CARD: PipelineCard = {
  dealId: '11111111-1111-4111-8111-111111111111',
  clientName: 'Empresa Exemplo',
  code: '0.2',
  estimatedValue: '12500.00',
  currency: 'EUR',
  nextStep: 'Marcar chamada',
  ownerKind: 'staff',
  ownerLabel: 'Vladimir Silva',
  dueOn: '2026-10-20',
  overdue: false,
};

function renderBoard(move: MoveDeal) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <Board cards={[CARD]} move={move} />
    </NextIntlClientProvider>,
  );
}

function column(name: RegExp) {
  return screen.getByRole('region', { name });
}

async function openMoveDialog() {
  await userEvent.click(screen.getByRole('button', { name: /Mover Empresa Exemplo para/ }));
  return screen.getByRole('dialog');
}

describe('Board', () => {
  it('lets keyboard users reach every scrolling stage row, even without deals', () => {
    renderBoard(vi.fn<MoveDeal>());

    for (const stage of ['Pré-venda', 'Core', 'Orbit']) {
      const row = screen.getByRole('region', { name: `Colunas de ${stage}` });
      expect(row.getAttribute('tabindex'), stage).toBe('0');
    }
  });

  it('reverts the card and shows the rule when the move is refused', async () => {
    const move = vi.fn<MoveDeal>(async () => ({
      ok: false,
      message: 'Marque a chamada no separador Chamadas antes de passar a 0.3.',
    }));
    renderBoard(move);

    const dialog = await openMoveDialog();
    await userEvent.selectOptions(within(dialog).getByLabelText('Mover para'), '0.3');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mover' }));

    expect(
      await screen.findByText('Marque a chamada no separador Chamadas antes de passar a 0.3.'),
    ).toBeDefined();
    expect(within(column(/^0\.2 /)).getByText('Empresa Exemplo')).toBeDefined();
    expect(within(column(/^0\.3 /)).queryByText('Empresa Exemplo')).toBeNull();
  });

  it('asks for a reason before moving to X.4', async () => {
    const move = vi.fn<MoveDeal>(async () => ({ ok: true }));
    renderBoard(move);

    const dialog = await openMoveDialog();
    await userEvent.selectOptions(within(dialog).getByLabelText('Mover para'), 'X.4');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mover' }));

    expect(within(dialog).getByText('Indique o motivo desta mudança.')).toBeDefined();
    expect(move).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Escolheu outra agência');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mover' }));

    expect(move).toHaveBeenCalledWith({
      dealId: CARD.dealId,
      to: 'X.4',
      reason: 'Escolheu outra agência',
    });
  });

  it('moves with the keyboard menu', async () => {
    const move = vi.fn<MoveDeal>(async () => ({ ok: true }));
    renderBoard(move);

    const dialog = await openMoveDialog();
    await userEvent.selectOptions(within(dialog).getByLabelText('Mover para'), 'X.1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mover' }));

    expect(await within(column(/^X\.1 /)).findByText('Empresa Exemplo')).toBeDefined();
    expect(within(column(/^0\.2 /)).queryByText('Empresa Exemplo')).toBeNull();
  });
});
