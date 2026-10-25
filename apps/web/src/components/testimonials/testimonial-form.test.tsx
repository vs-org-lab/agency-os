// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { TestimonialForm } from './testimonial-form';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

afterEach(() => {
  cleanup();
});

function renderForm(send = vi.fn(async () => ({ ok: true }) as const)) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages}>
      <TestimonialForm projectId="project-1" projectName="Website" initial={null} send={send} />
    </NextIntlClientProvider>,
  );
  return send;
}

describe('TestimonialForm', () => {
  it('the testimonial form sends text, name, role and consent', async () => {
    const send = renderForm();

    fireEvent.change(screen.getByLabelText('O seu testemunho'), {
      target: { value: 'Trabalho excelente.' },
    });
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Marta Lopes' } });
    fireEvent.change(screen.getByLabelText('Função'), { target: { value: 'Diretora' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Autorizo/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar testemunho' }));
    });

    expect(send).toHaveBeenCalledWith({
      projectId: 'project-1',
      body: 'Trabalho excelente.',
      authorName: 'Marta Lopes',
      authorRole: 'Diretora',
      consentPublish: true,
    });
    expect(screen.getByText('Obrigado pelo seu testemunho.')).toBeTruthy();
  });

  it('asks for the text and the name before sending', async () => {
    const send = renderForm();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar testemunho' }));
    });

    expect(send).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Escreva o testemunho e o seu nome.');
  });

  it('ties the error to the empty fields and focuses the first one', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('O seu testemunho'), {
      target: { value: 'Trabalho excelente.' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar testemunho' }));
    });

    const name = screen.getByLabelText('Nome');
    const alert = screen.getByRole('alert');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(name.getAttribute('aria-describedby')).toContain(alert.id);
    expect(screen.getByLabelText('O seu testemunho').getAttribute('aria-invalid')).toBeNull();
    expect(document.activeElement).toBe(name);
  });
});
