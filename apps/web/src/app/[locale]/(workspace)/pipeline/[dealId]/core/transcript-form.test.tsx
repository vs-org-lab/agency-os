// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { TranscriptForm } from './transcript-form';

afterEach(() => {
  cleanup();
});

describe('TranscriptForm', () => {
  it('keeps the pasted transcript and shows the error when saving fails', async () => {
    const save = vi.fn(async () => ({ status: 'error' as const, code: 'not_found' }));
    render(
      <NextIntlClientProvider locale="pt-PT" messages={messages}>
        <TranscriptForm id="transcript" initialValue="" save={save} />
      </NextIntlClientProvider>,
    );
    const field = screen.getByLabelText('Transcrição da call') as HTMLTextAreaElement;

    fireEvent.change(field, { target: { value: 'Uma transcrição longa colada da chamada.' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar transcrição' }));
    });

    expect(save).toHaveBeenCalledWith('Uma transcrição longa colada da chamada.');
    expect(field.value).toBe('Uma transcrição longa colada da chamada.');
    expect(screen.getByRole('alert').textContent).toBe('Não foi possível guardar a transcrição.');
  });

  it('adopts a newer transcript when the field is untouched', () => {
    const save = vi.fn(async () => ({ status: 'saved' as const }));
    const view = (initialValue: string) => (
      <NextIntlClientProvider locale="pt-PT" messages={messages}>
        <TranscriptForm id="transcript" initialValue={initialValue} save={save} />
      </NextIntlClientProvider>
    );
    const { rerender } = render(view('Notas'));

    rerender(view('Notas\n\n— Gravação —'));

    const field = screen.getByLabelText('Transcrição da call') as HTMLTextAreaElement;
    expect(field.value).toBe('Notas\n\n— Gravação —');
  });

  it('adds a newly appended section to unsaved edits', () => {
    const save = vi.fn(async () => ({ status: 'saved' as const }));
    const view = (initialValue: string) => (
      <NextIntlClientProvider locale="pt-PT" messages={messages}>
        <TranscriptForm id="transcript" initialValue={initialValue} save={save} />
      </NextIntlClientProvider>
    );
    const { rerender } = render(view('Notas'));
    const field = screen.getByLabelText('Transcrição da call') as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'Notas editadas' } });

    rerender(view('Notas\n\n— Gravação —'));

    expect(field.value).toBe('Notas editadas\n\n— Gravação —');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('blocks saving over a transcript changed elsewhere', () => {
    const save = vi.fn(async () => ({ status: 'saved' as const }));
    const view = (initialValue: string) => (
      <NextIntlClientProvider locale="pt-PT" messages={messages}>
        <TranscriptForm id="transcript" initialValue={initialValue} save={save} />
      </NextIntlClientProvider>
    );
    const { rerender } = render(view('Notas'));
    const field = screen.getByLabelText('Transcrição da call') as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'Notas editadas' } });

    rerender(view('Texto reescrito noutra sessão'));

    expect(field.value).toBe('Notas editadas');
    expect(screen.getByRole('status').textContent).toBe(
      'Chegou uma transcrição nova. Copie as suas alterações e recarregue a página antes de guardar.',
    );
    expect(
      (screen.getByRole('button', { name: 'Guardar transcrição' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
