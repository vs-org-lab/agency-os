// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { ProofFileView } from '@/modules/proofing';
import { ProofsSection, type ProofsActions } from './proofs-section';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ROUNDS = { used: 0, limit: 3, warning: false, extra: false };

function actions(): ProofsActions {
  return {
    start: vi.fn(async () => ({ ok: true as const, versionId: 'v-new', uploadUrl: 'https://s/u' })),
    newVersion: vi.fn(async () => ({
      ok: true as const,
      versionId: 'v-3',
      uploadUrl: 'https://s/u',
    })),
    finish: vi.fn(async () => ({ ok: false as const, code: 'invalid_file' })),
    request: vi.fn(async () => ({ ok: true as const })),
    withdraw: vi.fn(async () => ({ ok: true as const })),
    saveLimit: vi.fn(async () => ({ ok: true as const })),
  };
}

function renderSection(files: ProofFileView[], proofActions: ProofsActions) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages}>
      <ProofsSection
        clientId="client-1"
        projectId="project-1"
        files={files}
        rounds={ROUNDS}
        writable
        actions={proofActions}
      />
    </NextIntlClientProvider>,
  );
}

const version = (
  id: string,
  number: number,
  status: 'uploading' | 'ready' | 'rejected',
): ProofFileView['versions'][number] => ({
  id,
  number,
  kind: 'image',
  status,
  createdAt: '2026-10-10T09:00:00.000Z',
  approval: null,
  openComments: 0,
});

describe('proofs section', () => {
  it('a failed upload is closed on the server so the version is not left uploading', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('offline'))),
    );
    const proofActions = actions();
    renderSection(
      [{ id: 'file-1', title: 'Logótipo', phaseId: null, versions: [version('v-2', 2, 'ready')] }],
      proofActions,
    );

    fireEvent.change(screen.getByLabelText(messages.proofing.section.newVersion), {
      target: { files: [new File(['x'], 'logo.png', { type: 'image/png' })] },
    });

    await waitFor(() => expect(proofActions.finish).toHaveBeenCalledWith('v-3'));
    expect(await screen.findByText(messages.proofing.errors.upload_failed)).toBeTruthy();
  });

  it('the previous version can be sent for approval while a new one uploads', () => {
    renderSection(
      [
        {
          id: 'file-1',
          title: 'Logótipo',
          phaseId: null,
          versions: [version('v-3', 3, 'uploading'), version('v-2', 2, 'ready')],
        },
      ],
      actions(),
    );

    expect(
      screen.getByRole('button', { name: messages.proofing.section.requestApproval }),
    ).toBeTruthy();
  });
});
