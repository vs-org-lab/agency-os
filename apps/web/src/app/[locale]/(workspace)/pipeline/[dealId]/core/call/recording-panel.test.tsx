// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { RecordingPanel, type RecordingPanelActions } from './recording-panel';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockReset();
});

function actions(): RecordingPanelActions {
  return {
    start: vi.fn(async () => ({
      ok: true as const,
      recordingId: 'recording-1',
      uploads: [{ track: 'client' as const, url: 'https://storage.example/upload?token=t' }],
    })),
    confirm: vi.fn(async () => ({ ok: true as const })),
    retry: vi.fn(async () => ({ ok: true as const })),
  };
}

function renderPanel(panelActions: RecordingPanelActions) {
  return render(
    <NextIntlClientProvider locale="pt-PT" messages={messages}>
      <RecordingPanel
        engagementId="engagement-1"
        dealId="deal-1"
        latest={null}
        actions={panelActions}
      />
    </NextIntlClientProvider>,
  );
}

function audioFile(size: number, name = 'call.mp3', type = 'audio/mpeg'): File {
  const file = new File([new Uint8Array([1, 2, 3])], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('RecordingPanel', () => {
  it('recording needs the client consent', async () => {
    const panelActions = actions();
    renderPanel(panelActions);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Gravar a call' }));
    });

    expect(screen.getByRole('alert').textContent).toBe(
      'Confirme que o cliente autorizou a gravação.',
    );
    expect(panelActions.start).not.toHaveBeenCalled();
  });

  it('refuses an audio file above 25 MB', async () => {
    const panelActions = actions();
    renderPanel(panelActions);
    fireEvent.click(screen.getByRole('checkbox', { name: 'O cliente autorizou a gravação' }));

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Carregar ficheiro de áudio'), {
        target: { files: [audioFile(26_214_401)] },
      });
    });

    expect(screen.getByRole('alert').textContent).toBe('O ficheiro tem mais de 25 MB.');
    expect(panelActions.start).not.toHaveBeenCalled();
  });

  it('uploads an audio file and confirms it', async () => {
    const panelActions = actions();
    const upload = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', upload);
    renderPanel(panelActions);
    fireEvent.click(screen.getByRole('checkbox', { name: 'O cliente autorizou a gravação' }));

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Carregar ficheiro de áudio'), {
        target: { files: [audioFile(3)] },
      });
    });

    expect(panelActions.start).toHaveBeenCalledWith('engagement-1', {
      source: 'upload',
      consent: true,
      contentType: 'audio/mpeg',
    });
    expect(upload).toHaveBeenCalledWith(
      'https://storage.example/upload?token=t',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(panelActions.confirm).toHaveBeenCalledWith('recording-1', 'deal-1');
    expect(refresh).toHaveBeenCalled();
  });

  it('keeps the recording pending when the upload fails', async () => {
    const panelActions = actions();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );
    renderPanel(panelActions);
    fireEvent.click(screen.getByRole('checkbox', { name: 'O cliente autorizou a gravação' }));

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Carregar ficheiro de áudio'), {
        target: { files: [audioFile(3)] },
      });
    });

    expect(screen.getByRole('alert').textContent).toBe(
      'O envio falhou. Verifique a ligação e tente de novo.',
    );
    expect(panelActions.confirm).not.toHaveBeenCalled();
  });

  it('offers a retry for a failed transcription', async () => {
    const panelActions = actions();
    render(
      <NextIntlClientProvider locale="pt-PT" messages={messages}>
        <RecordingPanel
          engagementId="engagement-1"
          dealId="deal-1"
          latest={{
            id: 'recording-9',
            source: 'call',
            status: 'failed',
            expired: false,
            createdAt: new Date('2026-10-08T13:30:00Z'),
          }}
          actions={panelActions}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText('A transcrição falhou.')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    });

    expect(panelActions.retry).toHaveBeenCalledWith('recording-9', 'deal-1');
  });
});
