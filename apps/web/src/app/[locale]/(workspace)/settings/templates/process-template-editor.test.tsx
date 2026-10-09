// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { ORBIT_PROCESS } from '@/modules/rooms';
import { ProcessTemplateEditor, type PublishProcess } from './process-template-editor';

afterEach(() => {
  cleanup();
});

function renderEditor(publish: PublishProcess) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages}>
      <ProcessTemplateEditor
        template={{
          key: 'orbit',
          name: 'Orbit',
          version: 1,
          isDefault: true,
          definition: ORBIT_PROCESS,
        }}
        publish={publish}
      />
    </NextIntlClientProvider>,
  );
}

describe('ProcessTemplateEditor', () => {
  it('editor adds and removes phases and steps', () => {
    renderEditor(vi.fn<PublishProcess>());

    expect(screen.getAllByRole('group', { name: /^Fase \d+$/ })).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar fase' }));
    expect(screen.getAllByRole('group', { name: /^Fase \d+$/ })).toHaveLength(7);

    const first = screen.getByRole('group', { name: 'Fase 1' });
    expect(within(first).getAllByLabelText('Nome do passo')).toHaveLength(3);
    fireEvent.click(within(first).getByRole('button', { name: 'Adicionar passo' }));
    expect(within(first).getAllByLabelText('Nome do passo')).toHaveLength(4);
    fireEvent.click(
      within(first).getAllByRole('button', { name: 'Remover passo' })[3] as HTMLElement,
    );
    expect(within(first).getAllByLabelText('Nome do passo')).toHaveLength(3);

    const [firstChained] = within(first).getAllByLabelText(
      'Enviado quando o anterior termina',
    ) as HTMLInputElement[];
    expect(firstChained?.disabled).toBe(true);
  });

  it('publishes the edited definition and reports the new version', async () => {
    const publish = vi.fn<PublishProcess>(async () => ({ ok: true, key: 'orbit', version: 2 }));
    renderEditor(publish);

    const first = screen.getByRole('group', { name: 'Fase 1' });
    fireEvent.change(within(first).getByLabelText('Nome da fase'), {
      target: { value: 'Descoberta' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publicar nova versão' }));
    });

    const [input] = publish.mock.calls[0] ?? [];
    expect(input?.key).toBe('orbit');
    expect(input?.makeDefault).toBe(true);
    expect(input?.definition.phases[0]?.name).toBe('Descoberta');
    expect(screen.getByRole('status').textContent).toBe('Versão 2 publicada.');
  });
});
