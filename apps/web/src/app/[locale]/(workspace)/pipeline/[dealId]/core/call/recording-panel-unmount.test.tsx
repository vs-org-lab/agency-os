// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { RecordingPanel } from './recording-panel';
import type * as Recorder from './recorder';

const capture = vi.hoisted(() => ({
  release: vi.fn(),
  stop: vi.fn(async () => ({ client: new Blob(['c']), studio: new Blob(['s']) })),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('./recorder', async (importOriginal) => ({
  ...(await importOriginal<typeof Recorder>()),
  startCapture: vi.fn(async () => ({
    client: {},
    studio: {},
    onEnded: vi.fn(),
    release: capture.release,
  })),
  recordStreams: vi.fn(() => ({ stop: capture.stop })),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('RecordingPanel while recording', () => {
  it('stops the capture without uploading when call mode is left', async () => {
    vi.stubGlobal('MediaRecorder', function MediaRecorder() {});
    const actions = {
      start: vi.fn(),
      confirm: vi.fn(),
      retry: vi.fn(),
    };
    const view = render(
      <NextIntlClientProvider locale="pt-PT" messages={messages}>
        <RecordingPanel
          engagementId="engagement-1"
          dealId="deal-1"
          latest={null}
          actions={actions}
        />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'O cliente autorizou a gravação' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Gravar a call' }));
    });
    expect(screen.getByRole('button', { name: 'Parar e enviar' })).toBeTruthy();

    await act(async () => {
      view.unmount();
    });

    expect(capture.stop).toHaveBeenCalledTimes(1);
    expect(capture.release).toHaveBeenCalledTimes(1);
    expect(actions.start).not.toHaveBeenCalled();
  });
});
