// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { NoteField } from './note-field';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderField(save: (body: string) => Promise<boolean>) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages}>
      <NoteField id="note-1" label="Notas do bloco" initialValue="" save={save} />
    </NextIntlClientProvider>,
  );
  return screen.getByLabelText('Notas do bloco');
}

describe('NoteField', () => {
  it('saves a note after typing stops', async () => {
    const save = vi.fn(async () => true);
    const field = renderField(save);

    fireEvent.change(field, { target: { value: 'Clientes chegam por indicação' } });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(save).toHaveBeenCalledWith('Clientes chegam por indicação');
    expect(screen.getByText('Guardado')).toBeTruthy();
  });

  it('shows the retry state when saving fails', async () => {
    const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const field = renderField(save);

    fireEvent.change(field, { target: { value: 'Nota' } });
    await act(async () => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.getByText('Não guardado')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    });

    expect(save).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Guardado')).toBeTruthy();
  });

  it('flushes a pending note when the field unmounts', async () => {
    const save = vi.fn(async () => true);
    const view = render(
      <NextIntlClientProvider locale="pt-PT" messages={messages}>
        <NoteField id="note-1" label="Notas do bloco" initialValue="" save={save} />
      </NextIntlClientProvider>,
    );

    fireEvent.change(screen.getByLabelText('Notas do bloco'), {
      target: { value: 'Escrito antes de mudar de bloco' },
    });
    view.unmount();

    expect(save).toHaveBeenCalledWith('Escrito antes de mudar de bloco');
  });

  it('shows a newer saved value when the field is not being edited', async () => {
    const save = vi.fn(async () => true);
    const view = render(
      <NextIntlClientProvider locale="pt-PT" messages={messages}>
        <NoteField id="note-1" label="Notas do bloco" initialValue="Antes" save={save} />
      </NextIntlClientProvider>,
    );

    view.rerender(
      <NextIntlClientProvider locale="pt-PT" messages={messages}>
        <NoteField
          id="note-1"
          label="Notas do bloco"
          initialValue="Resumo do assistente"
          save={save}
        />
      </NextIntlClientProvider>,
    );

    expect((screen.getByLabelText('Notas do bloco') as HTMLTextAreaElement).value).toBe(
      'Resumo do assistente',
    );
  });

  it('hides the saved state while there are unsaved edits', async () => {
    const save = vi.fn(async () => true);
    const field = renderField(save);

    fireEvent.change(field, { target: { value: 'Primeira' } });
    await act(async () => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.getByText('Guardado')).toBeTruthy();

    fireEvent.change(field, { target: { value: 'Primeira e segunda' } });

    expect(screen.queryByText('Guardado')).toBeNull();
  });
});
