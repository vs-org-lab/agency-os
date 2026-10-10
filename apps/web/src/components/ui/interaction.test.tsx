// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { ActionButton } from './action-button';
import { HoldToConfirm } from './hold-to-confirm';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderWithIntl(node: React.ReactNode) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      {node}
    </NextIntlClientProvider>,
  );
}

describe('HoldToConfirm', () => {
  it('confirms only after the full hold', () => {
    const onConfirm = vi.fn();
    renderWithIntl(
      <HoldToConfirm label="Retirar acesso" onConfirm={onConfirm} durationMs={1000} />,
    );
    const button = screen.getByRole('button', { name: /Retirar acesso/ });

    fireEvent.pointerDown(button);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.pointerUp(button);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.pointerDown(button);
    expect(button.getAttribute('aria-busy')).toBe('true');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('holding Enter or Space confirms from the keyboard', () => {
    const onConfirm = vi.fn();
    renderWithIntl(<HoldToConfirm label="Retirar acesso" onConfirm={onConfirm} durationMs={800} />);
    const button = screen.getByRole('button', { name: /Retirar acesso/ });

    fireEvent.keyDown(button, { key: ' ' });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.keyUp(button, { key: ' ' });
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyDown(button, { key: 'Enter', repeat: true });
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain(
      'mantenha premido para confirmar',
    );
  });
});

describe('ActionButton', () => {
  it('shows the pending label while running and the done label after', async () => {
    let finish: (value: { ok: true }) => void = () => {};
    const action = vi.fn(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          finish = resolve;
        }),
    );
    renderWithIntl(
      <ActionButton
        labels={{ idle: 'Pedir aprovação', pending: 'A pedir…', done: 'Pedido enviado' }}
        action={action}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pedir aprovação' }));
    });
    expect(screen.getByRole('button', { name: 'A pedir…' }).hasAttribute('disabled')).toBe(true);
    await act(async () => {
      finish({ ok: true });
    });
    expect(screen.getByRole('button', { name: 'Pedido enviado' })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.getByRole('button', { name: 'Pedir aprovação' })).toBeTruthy();
  });
});
