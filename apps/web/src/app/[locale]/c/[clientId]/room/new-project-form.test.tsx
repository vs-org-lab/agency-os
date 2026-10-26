// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { chooseOption, installRadixDomPolyfills } from '../../../../../../test/radix-dom';
import { NewProjectForm } from './new-project-form';

beforeAll(installRadixDomPolyfills);
afterEach(cleanup);

describe('NewProjectForm', () => {
  it('creates the project from the chosen template', async () => {
    const user = userEvent.setup();
    const create = vi.fn(async () => ({ ok: true }) as const);
    render(
      <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
        <NewProjectForm
          clientId="client-1"
          templates={[
            { key: 'website', name: 'Website' },
            { key: 'branding', name: 'Branding' },
          ]}
          create={create}
        />
      </NextIntlClientProvider>,
    );

    fireEvent.change(screen.getByLabelText('Nome do projeto'), { target: { value: 'Novo site' } });
    await chooseOption(user, 'Modelo de processo', 'Branding');
    await user.click(screen.getByRole('button', { name: 'Criar projeto' }));

    expect(create).toHaveBeenCalledWith({
      clientId: 'client-1',
      name: 'Novo site',
      templateKey: 'branding',
    });
  });
});
