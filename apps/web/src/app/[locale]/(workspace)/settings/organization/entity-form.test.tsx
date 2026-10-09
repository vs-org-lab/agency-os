// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { LegalEntityInput } from '@/modules/contracts/server';
import type { EntityActionResult } from './actions';
import { EntityForm } from './entity-form';

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
});

type Save = (input: LegalEntityInput) => Promise<EntityActionResult>;

function fill() {
  const fields: Array<[string, string]> = [
    ['Denominação', 'Aurion Creative Lda'],
    ['NIF', '516000000'],
    ['Morada da sede', 'Avenida da Liberdade 1, Lisboa'],
    ['Email', 'geral@aurion.test'],
    ['Representante', 'Vladimir Silva'],
    ['Cargo do representante', 'Gerente'],
  ];
  for (const [label, value] of fields) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}

function renderForm(save: Save) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages}>
      <EntityForm entity={null} idPrefix="new-entity" save={save} />
    </NextIntlClientProvider>,
  );
}

describe('EntityForm', () => {
  it('clears a new entity after saving so a second click cannot duplicate it', async () => {
    const save = vi.fn<Save>(async () => ({ ok: true }));
    renderForm(save);
    fill();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar entidade' }));
    });

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ legalName: 'Aurion Creative Lda', country: 'PT' }),
    );
    expect((screen.getByLabelText('Denominação') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('status').textContent).toBe('Entidade guardada.');
  });

  it('keeps the typed values when the save is refused', async () => {
    renderForm(vi.fn<Save>(async () => ({ ok: false })));
    fill();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar entidade' }));
    });

    expect((screen.getByLabelText('Denominação') as HTMLInputElement).value).toBe(
      'Aurion Creative Lda',
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'Não foi possível guardar. Confirme os campos.',
    );
  });
});
