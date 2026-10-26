// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { SignatureForm, type SignActionResult } from './signature-form';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

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
  refresh.mockReset();
});

type Sign = (contractId: string, typedName: string, bodyHash: string) => Promise<SignActionResult>;

function renderForm(sign = vi.fn<Sign>(async () => ({ ok: true }))) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages}>
      <SignatureForm
        contractId="contract-1"
        bodyHash={'a'.repeat(64)}
        expectedName="Ana Costa"
        submitLabel="Assinar contrato"
        sign={sign}
      />
    </NextIntlClientProvider>,
  );
  return sign;
}

describe('SignatureForm', () => {
  it('ties a name mismatch to the name field and focuses it', async () => {
    renderForm(vi.fn<Sign>(async () => ({ ok: false, code: 'name_mismatch' })));
    const name = screen.getByLabelText('Escreva o seu nome completo: Ana Costa');
    fireEvent.change(name, { target: { value: 'Outra Pessoa' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Li e aceito este contrato' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Assinar contrato' }));
    });

    const alert = screen.getByRole('alert');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(name.getAttribute('aria-describedby')).toContain(alert.id);
    await waitFor(() => expect(document.activeElement).toBe(name));
  });

  it('signs with the typed name once the confirmation is ticked', async () => {
    const sign = renderForm();
    fireEvent.change(screen.getByLabelText('Escreva o seu nome completo: Ana Costa'), {
      target: { value: 'Ana Costa' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Li e aceito este contrato' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Assinar contrato' }));
    });

    expect(sign).toHaveBeenCalledWith('contract-1', 'Ana Costa', 'a'.repeat(64));
    expect(refresh).toHaveBeenCalled();
  });

  it('does not sign without the confirmation', async () => {
    const sign = renderForm();
    fireEvent.change(screen.getByLabelText('Escreva o seu nome completo: Ana Costa'), {
      target: { value: 'Ana Costa' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Assinar contrato' }));
    });

    expect(sign).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Confirme que leu e aceita o contrato.');
  });

  it('explains a name that does not match', async () => {
    renderForm(vi.fn<Sign>(async () => ({ ok: false, code: 'name_mismatch' })));
    fireEvent.change(screen.getByLabelText('Escreva o seu nome completo: Ana Costa'), {
      target: { value: 'Ana' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Li e aceito este contrato' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Assinar contrato' }));
    });

    expect(screen.getByRole('alert').textContent).toBe('O nome tem de ser exatamente Ana Costa.');
  });
});
