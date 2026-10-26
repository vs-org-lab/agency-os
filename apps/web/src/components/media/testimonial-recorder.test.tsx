// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { installFakeMedia } from './media-testing';
import { TestimonialRecorder, type TestimonialRecording } from './testimonial-recorder';

const QUESTIONS = [
  { topic: 'Antes', text: 'Como era a sua situação?' },
  { topic: 'A mudança', text: 'O que mudou?' },
  { topic: 'O resultado', text: 'Que resultado viu?' },
];

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:video'), revokeObjectURL: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderRecorder(
  props: Partial<Parameters<typeof TestimonialRecorder>[0]> = {},
  submit = vi.fn(async (_recording: TestimonialRecording) => true),
) {
  const onWriteInstead = vi.fn();
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages}>
      <TestimonialRecorder
        questions={QUESTIONS}
        maxSeconds={300}
        submit={submit}
        onWriteInstead={onWriteInstead}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { submit, onWriteInstead };
}

async function enableCamera() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Ativar câmara e microfone' }));
  });
}

async function startRecording() {
  await enableCamera();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Começar a gravar' }));
  });
}

describe('TestimonialRecorder', () => {
  it('opens the camera with the microphone and lists the devices', async () => {
    const { getUserMedia } = installFakeMedia({
      kinds: ['audio', 'video'],
      devices: [
        { deviceId: 'cam-1', kind: 'videoinput', label: 'Câmara integrada' },
        { deviceId: 'mic-1', kind: 'audioinput', label: 'Microfone integrado' },
      ],
    });
    renderRecorder();
    await act(async () => {});

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByText('1 de 3 · Antes')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Escrever em vez disso' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Começar a gravar' })).toBeNull();

    await enableCamera();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
    expect(screen.getByRole('combobox', { name: 'Câmara' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Microfone' })).toBeTruthy();
    expect(screen.getByRole('meter', { name: 'Nível do microfone' })).toBeTruthy();
  });

  it('holds the recording back until the author has consented', async () => {
    installFakeMedia({ kinds: ['audio', 'video'] });
    renderRecorder({ disabled: true });
    await enableCamera();

    expect(
      (screen.getByRole('button', { name: 'Começar a gravar' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('lays the questions over the camera one at a time and marks where each started', async () => {
    installFakeMedia({ kinds: ['audio', 'video'] });
    const { submit } = renderRecorder();
    await startRecording();

    expect(screen.getByText('1 de 3 · Antes')).toBeTruthy();
    expect(screen.getByText('Como era a sua situação?')).toBeTruthy();
    expect(screen.getByRole('status').getAttribute('data-status')).toBe('recording');

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Seguinte' }));
    });
    expect(screen.getByText('2 de 3 · A mudança')).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(45_000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Parar' }));
    });

    expect(screen.getByRole('slider', { name: 'Posição do vídeo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pergunta 2' })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar vídeo' }));
    });
    expect(submit).toHaveBeenCalledTimes(1);
    const sent = submit.mock.calls[0]?.[0];
    expect(sent?.durationSeconds).toBe(75);
    expect(sent?.contentType).toBe('video/webm');
    expect(sent?.chapters).toEqual([
      { index: 0, startedAtMs: 0 },
      { index: 1, startedAtMs: 30_000 },
    ]);
  });

  it('pauses without counting the pause', async () => {
    installFakeMedia({ kinds: ['audio', 'video'] });
    renderRecorder();
    await startRecording();

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    });
    expect(screen.getByRole('status').getAttribute('data-status')).toBe('paused');
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    });
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    expect(screen.getByRole('status').textContent).toContain('00:15');
  });

  it('stops at the limit and keeps what was recorded', async () => {
    installFakeMedia({ kinds: ['audio', 'video'] });
    renderRecorder({ maxSeconds: 60 });
    await startRecording();

    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });

    expect(screen.getByRole('slider', { name: 'Posição do vídeo' })).toBeTruthy();
    expect(screen.getByText(/Limite de 1 min atingido/)).toBeTruthy();
  });

  it('records again after discarding the take', async () => {
    const { getUserMedia } = installFakeMedia({ kinds: ['audio', 'video'] });
    renderRecorder();
    await startRecording();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Parar' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Gravar de novo' }));
    });

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Começar a gravar' })).toBeTruthy();
  });

  it('offers to write instead when the camera is denied', async () => {
    installFakeMedia({ deny: true });
    const { onWriteInstead } = renderRecorder();
    await enableCamera();

    expect(screen.getByRole('alert').textContent).toContain('câmara e ao microfone');
    fireEvent.click(screen.getByRole('button', { name: 'Escrever em vez disso' }));
    expect(onWriteInstead).toHaveBeenCalled();
  });

  it('lets the author write instead before recording', async () => {
    installFakeMedia({ kinds: ['audio', 'video'] });
    const { onWriteInstead } = renderRecorder();
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: 'Escrever em vez disso' }));
    expect(onWriteInstead).toHaveBeenCalled();
  });

  it('keeps the take when the upload fails', async () => {
    installFakeMedia({ kinds: ['audio', 'video'] });
    renderRecorder(
      {},
      vi.fn(async () => false),
    );
    await startRecording();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Parar' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar vídeo' }));
    });

    expect(screen.getByRole('alert').textContent).toBe(
      'Não foi possível enviar o vídeo. Tente de novo.',
    );
    expect(screen.getByRole('button', { name: 'Enviar vídeo' })).toBeTruthy();
  });
});
