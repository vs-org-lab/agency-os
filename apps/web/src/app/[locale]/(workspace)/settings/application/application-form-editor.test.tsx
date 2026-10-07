// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { DEFAULT_APPLICATION_FORM } from '@/modules/commercial';
import { ApplicationFormEditor } from './application-form-editor';

afterEach(() => {
  cleanup();
});

function renderEditor(publish = vi.fn(async () => ({ ok: true as const, version: 2 }))) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages}>
      <ApplicationFormEditor definition={DEFAULT_APPLICATION_FORM} version={1} publish={publish} />
    </NextIntlClientProvider>,
  );
  return publish;
}

describe('ApplicationFormEditor', () => {
  it('editor preview recomputes the path when answers change', async () => {
    renderEditor();
    const preview = screen.getByRole('region', { name: 'Pré-visualização da pontuação' });

    for (const [question, option] of [
      ['Qual é a sua função?', 'ceo_founder_partner'],
      ['Setor', 'consulting'],
      ['Faturação anual ou investimento levantado', 'over_20m'],
      ['Investimento previsto', 'over_50k'],
      ['Quando quer começar?', 'this_quarter'],
    ] as const) {
      await userEvent.selectOptions(within(preview).getByLabelText(question), option);
    }

    expect(within(preview).getByText('13 pontos · caminho A')).toBeDefined();

    await userEvent.selectOptions(
      within(preview).getByLabelText('Investimento previsto'),
      'under_10k',
    );
    expect(within(preview).getByText('10 pontos · caminho C')).toBeDefined();
  });

  it('publishes the edited thresholds as a new version', async () => {
    const publish = renderEditor();

    const thresholdA = screen.getByLabelText('Pontuação mínima para o caminho A');
    await userEvent.clear(thresholdA);
    await userEvent.type(thresholdA, '10');
    await userEvent.click(screen.getByRole('button', { name: 'Publicar nova versão' }));

    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ thresholds: { a: 10, b: 6 } }));
    expect(await screen.findByText('Versão 2 publicada.')).toBeDefined();
  });
});
