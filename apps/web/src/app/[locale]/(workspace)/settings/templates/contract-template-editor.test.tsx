// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { ContractTemplateEditor } from './contract-template-editor';

afterEach(() => {
  cleanup();
});

function renderEditor(publish = vi.fn()) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages}>
      <ContractTemplateEditor
        locale="pt-PT"
        version={1}
        body="Contrato com {{cliente.denominacao}}"
        publish={publish}
      />
    </NextIntlClientProvider>,
  );
  return publish;
}

describe('ContractTemplateEditor', () => {
  it('keeps the text and names unknown fields when publishing fails', async () => {
    const publish = renderEditor(
      vi.fn(async () => ({
        ok: false as const,
        rule: 'invalid_template' as const,
        unknown: ['cliente.telefone'],
      })),
    );
    const field = screen.getByLabelText('Texto do contrato') as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'Ligar para {{cliente.telefone}}' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publicar versão' }));
    });

    expect(publish).toHaveBeenCalledWith('Ligar para {{cliente.telefone}}');
    expect(field.value).toBe('Ligar para {{cliente.telefone}}');
    expect(screen.getByRole('alert').textContent).toBe('Campos desconhecidos: cliente.telefone');
  });

  it('previews the contract with sample data', () => {
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Pré-visualizar' }));

    expect(screen.getByText('Contrato com Empresa Exemplo, SA')).toBeTruthy();
  });

  it('confirms the published version', async () => {
    renderEditor(vi.fn(async () => ({ ok: true as const, version: 2 })));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publicar versão' }));
    });

    expect(screen.getByRole('status').textContent).toBe('Versão 2 publicada.');
  });
});
