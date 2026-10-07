// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { DEFAULT_APPLICATION_FORM } from '@/modules/commercial';
import { ApplicationForm } from './application-form';
import type { ApplyActionState } from './apply-state';

function renderForm(action = vi.fn(async (): Promise<ApplyActionState> => ({ status: 'idle' }))) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages}>
      <ApplicationForm
        definition={DEFAULT_APPLICATION_FORM}
        version={1}
        embed={false}
        action={action}
      />
    </NextIntlClientProvider>,
  );
  return action;
}

async function fillContact(email = 'ana@empresa.pt') {
  await userEvent.type(screen.getByLabelText('Nome'), 'Ana Costa');
  await userEvent.type(screen.getByLabelText('Email profissional'), email);
}

async function next() {
  await userEvent.click(screen.getByRole('button', { name: 'Seguinte' }));
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('ApplicationForm', () => {
  it('shows one question at a time with progress', async () => {
    renderForm();

    expect(screen.getByRole('heading', { name: 'Nome e email profissional' })).toBeDefined();
    expect(screen.getByText('Pergunta 1 de 9')).toBeDefined();
    expect(screen.queryByText('Empresa e website')).toBeNull();

    await next();
    expect(screen.getByText('Responda a esta pergunta para continuar.')).toBeDefined();

    await fillContact();
    await next();
    expect(screen.getByRole('heading', { name: 'Empresa e website' })).toBeDefined();
    expect(screen.getByText('Pergunta 2 de 9')).toBeDefined();
  });

  it('shows the decision maker question only for role other', async () => {
    renderForm();
    await fillContact();
    await next();
    await userEvent.type(screen.getByLabelText('Empresa'), 'Empresa Exemplo');
    await next();

    await userEvent.click(screen.getByRole('radio', { name: 'Outra' }));
    await next();

    expect(screen.getByRole('heading', { name: 'O decisor final vai participar?' })).toBeDefined();
    expect(screen.getByText('Pergunta 4 de 10')).toBeDefined();
  });

  it('warns on personal email without blocking', async () => {
    renderForm();
    await fillContact('ana@gmail.com');

    expect(
      screen.getByText(
        'Este parece ser um email pessoal. Se tiver um email da empresa, prefira-o.',
      ),
    ).toBeDefined();
    await next();
    expect(screen.getByRole('heading', { name: 'Empresa e website' })).toBeDefined();
  });

  it('restores the draft from sessionStorage', () => {
    window.sessionStorage.setItem(
      'apply-draft-v1',
      JSON.stringify({
        step: 2,
        answers: {
          contact: { fullName: 'Ana Costa', email: 'ana@empresa.pt' },
          company: { name: 'Empresa Exemplo', website: '' },
          choices: {},
          texts: {},
        },
        startedAt: Date.now() - 60_000,
      }),
    );

    renderForm();

    expect(screen.getByRole('heading', { name: 'Qual é a sua função?' })).toBeDefined();
    expect(screen.getByText('Pergunta 3 de 9')).toBeDefined();
  });

  it('requires consent before submitting', async () => {
    window.sessionStorage.setItem(
      'apply-draft-v1',
      JSON.stringify({
        step: 8,
        answers: {
          contact: { fullName: 'Ana Costa', email: 'ana@empresa.pt' },
          company: { name: 'Empresa Exemplo', website: '' },
          choices: {
            role: 'ceo_founder_partner',
            sector: 'consulting',
            revenue: 'over_20m',
            priority: 'brand_and_site',
            investment: 'over_50k',
            timing: 'this_quarter',
          },
          texts: { cost_of_inaction: 'Perdemos contratos.' },
        },
        startedAt: Date.now() - 60_000,
      }),
    );
    const action = renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Enviar candidatura' }));

    expect(screen.getByText('Para enviar, aceite o tratamento dos dados.')).toBeDefined();
    expect(action).not.toHaveBeenCalled();
  });
});
