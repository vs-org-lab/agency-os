// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { FakeMediaRecorder, installFakeMedia, removeMediaApis } from './media-testing';
import type { Recording } from './use-recorder';
import { VoiceNoteRecorder } from './voice-note-recorder';

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:note'), revokeObjectURL: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderRecorder(submit = vi.fn(async (_recording: Recording) => true), onSent = vi.fn()) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages}>
      <VoiceNoteRecorder submit={submit} onSent={onSent} />
    </NextIntlClientProvider>,
  );
  return { submit, onSent };
}

async function record() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Gravar nota de voz' }));
  });
}

describe('VoiceNoteRecorder', () => {
  it('records, shows the time and previews the note after stopping', async () => {
    const { getUserMedia, stream } = installFakeMedia({});
    renderRecorder();

    await record();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    expect(screen.getByRole('status').getAttribute('data-status')).toBe('recording');

    await act(async () => {
      vi.advanceTimersByTime(65_000);
    });
    expect(screen.getByRole('status').textContent).toContain('01:05');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Parar' }));
    });
    expect(screen.getByRole('slider', { name: 'Posição da nota de voz' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enviar nota de voz' })).toBeTruthy();
    expect(stream.tracks.every((track) => track.stop.mock.calls.length > 0)).toBe(true);
  });

  it('sends the recording and returns to the start', async () => {
    installFakeMedia({});
    const { submit, onSent } = renderRecorder();

    await record();
    await act(async () => {
      vi.advanceTimersByTime(12_000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Parar' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar nota de voz' }));
    });

    expect(submit).toHaveBeenCalledTimes(1);
    const sent = submit.mock.calls[0]?.[0];
    expect(sent?.durationSeconds).toBe(12);
    expect(sent?.contentType).toBe('audio/webm');
    expect(onSent).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Gravar nota de voz' })).toBeTruthy();
  });

  it('keeps the recording when the upload fails', async () => {
    installFakeMedia({});
    renderRecorder(vi.fn(async () => false));

    await record();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Parar' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar nota de voz' }));
    });

    expect(screen.getByRole('alert').textContent).toBe(
      'Não foi possível enviar a nota de voz. Tente de novo.',
    );
    expect(screen.getByRole('button', { name: 'Enviar nota de voz' })).toBeTruthy();
  });

  it('deletes the take', async () => {
    installFakeMedia({});
    renderRecorder();

    await record();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Parar' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apagar' }));
    });

    expect(screen.getByRole('button', { name: 'Gravar nota de voz' })).toBeTruthy();
  });

  it('stops by itself after three minutes', async () => {
    installFakeMedia({});
    renderRecorder();

    await record();
    await act(async () => {
      vi.advanceTimersByTime(181_000);
    });

    expect(FakeMediaRecorder.instances[0]?.state).toBe('inactive');
    expect(screen.getByText('Limite de 3:00 atingido.')).toBeTruthy();
  });

  it('explains a denied microphone', async () => {
    installFakeMedia({ deny: true });
    renderRecorder();

    await record();

    expect(screen.getByRole('alert').textContent).toContain('Não foi possível aceder ao microfone');
    expect(screen.getByRole('button', { name: 'Gravar nota de voz' })).toBeTruthy();
  });

  it('tells a browser without recording support to write instead', async () => {
    removeMediaApis();
    renderRecorder();
    await act(async () => {});

    expect(screen.getByRole('alert').textContent).toBe(
      'Este navegador não permite gravar áudio. Escreva a mensagem.',
    );
    expect(
      (screen.getByRole('button', { name: 'Gravar nota de voz' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
