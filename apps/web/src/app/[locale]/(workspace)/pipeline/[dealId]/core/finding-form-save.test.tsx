// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { FindingForm } from './finding-form';

afterEach(() => {
  cleanup();
});

function renderForm(action: Parameters<typeof FindingForm>[0]['action']) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages}>
      <FindingForm action={action} />
    </NextIntlClientProvider>,
  );
}

describe('FindingForm saving', () => {
  it('keeps the fields when the save is refused', async () => {
    const action = vi.fn(async () => ({ status: 'error' as const, code: 'call_limit' }));
    renderForm(action);
    fireEvent.change(screen.getByLabelText('Achado'), { target: { value: 'Sem prova social' } });
    fireEvent.change(screen.getByLabelText('Prova'), { target: { value: 'page' } });
    fireEvent.change(screen.getByLabelText('Valor da prova'), {
      target: { value: 'Página inicial' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar achado' }));
    });

    expect(action).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText('Achado') as HTMLInputElement).value).toBe('Sem prova social');
    expect(screen.getByRole('alert').textContent).toBe('Já há três achados marcados para a call.');
  });

  it('refuses a file above 4 MB before saving', async () => {
    const action = vi.fn(async () => ({ status: 'saved' as const }));
    renderForm(action);
    fireEvent.change(screen.getByLabelText('Achado'), { target: { value: 'Site lento' } });
    const file = new File([new Uint8Array(4_194_305)], 'prova.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Ficheiro (PNG, JPEG, WebP ou PDF até 4 MB)'), {
      target: { files: [file] },
    });

    await act(async () => {
      const form = screen.getByRole('button', { name: 'Guardar achado' }).closest('form');
      if (!form) throw new Error('form missing');
      fireEvent.submit(form);
    });

    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('O ficheiro tem mais de 4 MB.');
  });

  it('shows an error instead of crashing when the request fails', async () => {
    const action = vi.fn(async () => {
      throw new Error('Body exceeded 5mb limit');
    });
    renderForm(action);
    fireEvent.change(screen.getByLabelText('Achado'), { target: { value: 'Site lento' } });
    fireEvent.change(screen.getByLabelText('Prova'), { target: { value: 'none' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar achado' }));
    });

    expect(screen.getByRole('alert').textContent).toBe('Não foi possível guardar este achado.');
  });
});
