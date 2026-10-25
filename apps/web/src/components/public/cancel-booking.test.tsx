// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { CancelBooking } from './cancel-booking';

afterEach(() => {
  cleanup();
});

function show(action: () => Promise<{ status: 'idle' | 'error' }>) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages}>
      <CancelBooking action={action} />
    </NextIntlClientProvider>,
  );
}

describe('cancel booking', () => {
  it('cancelling the call asks first', async () => {
    const action = vi.fn(async () => ({ status: 'idle' as const }));
    show(action);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar chamada' }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Manter a chamada' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sim, cancelar' }));
    await waitFor(() => expect(action).toHaveBeenCalled());
  });

  it('a failed cancel says so', async () => {
    show(vi.fn(async () => ({ status: 'error' as const })));

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar chamada' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, cancelar' }));

    const message = await screen.findByText(
      'Não foi possível cancelar. Tente de novo dentro de momentos.',
    );
    expect(document.activeElement).toBe(message);
  });
});
