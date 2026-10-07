// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { BookingPanel, type BookingActionState } from './booking-panel';

afterEach(() => {
  cleanup();
});

function renderPanel(
  action: (state: BookingActionState, formData: FormData) => Promise<BookingActionState>,
) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <BookingPanel
        slots={['2026-10-13T09:00:00.000Z', '2026-10-13T09:15:00.000Z', '2026-10-14T13:00:00.000Z']}
        bookingTimeZone="Europe/Lisbon"
        defaultTimeZone="Africa/Luanda"
        durationMinutes={45}
        action={action}
      />
    </NextIntlClientProvider>,
  );
}

describe('BookingPanel', () => {
  it('renders slots in the visitor time zone', () => {
    renderPanel(vi.fn());

    expect(screen.getByRole('combobox', { name: 'Fuso horário' })).toHaveProperty(
      'value',
      'Africa/Luanda',
    );
    expect(screen.getByRole('button', { name: '10:00' })).toBeDefined();
    expect(screen.getByRole('button', { name: '10:15' })).toBeDefined();
  });

  it('shows slot taken and refreshes the list', async () => {
    const action = vi.fn(
      async (_state: BookingActionState, _formData: FormData): Promise<BookingActionState> => ({
        status: 'slot_taken',
        slots: ['2026-10-13T10:00:00.000Z'],
      }),
    );
    renderPanel(action);

    await userEvent.click(screen.getByRole('button', { name: '10:00' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar marcação' }));

    expect(
      await screen.findByText('Este horário acabou de ser ocupado. Escolha outro.'),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: '11:00' })).toBeDefined();
    expect(screen.queryByRole('button', { name: '10:15' })).toBeNull();
  });

  it('confirms the booking with the chosen time', async () => {
    const action = vi.fn(
      async (_state: BookingActionState, _formData: FormData): Promise<BookingActionState> => ({
        status: 'booked',
        startsAt: '2026-10-13T09:00:00.000Z',
        meetUrl: 'https://meet.google.com/abc-defg-hij',
      }),
    );
    renderPanel(action);

    await userEvent.click(screen.getByRole('button', { name: '10:00' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar marcação' }));

    expect(await screen.findByText('A chamada está marcada')).toBeDefined();
    const formData = action.mock.calls[0]?.[1] as FormData | undefined;
    expect(formData?.get('start')).toBe('2026-10-13T09:00:00.000Z');
    expect(formData?.get('timeZone')).toBe('Africa/Luanda');
  });
});
