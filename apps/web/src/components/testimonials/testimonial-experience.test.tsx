// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { installFakeMedia } from '@/components/media/media-testing';
import { TestimonialExperience } from './testimonial-experience';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:video'), revokeObjectURL: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderExperience() {
  const videoActions = {
    begin: vi.fn(async () => ({ ok: true as const, uploadUrl: 'https://storage.example/up' })),
    finish: vi.fn(async () => ({ ok: true as const })),
  };
  const send = vi.fn(async () => ({ ok: true }) as const);
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages}>
      <TestimonialExperience
        projectId="project-1"
        projectName="Website"
        initial={null}
        send={send}
        videoActions={videoActions}
      />
    </NextIntlClientProvider>,
  );
  return videoActions;
}

describe('TestimonialExperience', () => {
  it('opens on the video mode and switches to writing', async () => {
    installFakeMedia({ kinds: ['audio', 'video'] });
    renderExperience();
    await act(async () => {});

    expect(screen.getByRole('button', { name: 'Começar a gravar' })).toBeTruthy();
    await act(async () => {
      fireEvent.mouseDown(screen.getByRole('tab', { name: 'Escrever' }), { button: 0 });
      fireEvent.click(screen.getByRole('tab', { name: 'Escrever' }));
    });
    expect(screen.getByLabelText('O seu testemunho')).toBeTruthy();
  });

  it('needs the recording consent and a name before recording', async () => {
    installFakeMedia({ kinds: ['audio', 'video'] });
    renderExperience();
    await act(async () => {});

    const start = screen.getByRole('button', { name: 'Começar a gravar' }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Marta Lopes' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Autorizo a gravação/ }));
    expect(start.disabled).toBe(false);
  });

  it('uploads the recording and confirms it with the chapters', async () => {
    installFakeMedia({ kinds: ['audio', 'video'] });
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const actions = renderExperience();
    await act(async () => {});

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Marta Lopes' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Autorizo a gravação/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Começar a gravar' }));
    });
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Parar' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar vídeo' }));
    });

    expect(actions.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        authorName: 'Marta Lopes',
        consentRecording: true,
        contentType: 'video/webm',
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://storage.example/up',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(actions.finish).toHaveBeenCalledWith({
      projectId: 'project-1',
      durationSeconds: 20,
      chapters: [{ index: 0, startedAtMs: 0 }],
    });
    expect(screen.getByText('Obrigado pelo seu testemunho em vídeo.')).toBeTruthy();
  });
});
