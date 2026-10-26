// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { installRadixDomPolyfills } from '../../../test/radix-dom';
import { TaskFilesPreview } from './task-files-preview';

beforeAll(installRadixDomPolyfills);

afterEach(() => {
  cleanup();
});

const FILES = [
  { id: 'f1', name: 'logotipo.png', mimeType: 'image/png', url: 'https://files.test/logotipo.png' },
  { id: 'f2', name: 'briefing.pdf', mimeType: 'application/pdf', url: null },
];

function renderPreview(
  loadPreview = vi.fn(async () => ({ ok: true as const, files: FILES })),
  fileCount = 2,
) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <TaskFilesPreview task={{ id: 't1', title: 'Entrega', fileCount }} loadPreview={loadPreview}>
        <button type="button">Entrega</button>
      </TaskFilesPreview>
    </NextIntlClientProvider>,
  );
  return loadPreview;
}

describe('task files preview', () => {
  it('opens on pointer hover after delay', async () => {
    const user = userEvent.setup();
    const loadPreview = renderPreview();

    await user.hover(screen.getByRole('button', { name: 'Entrega' }));
    expect(screen.queryByRole('list', { name: 'Ficheiros de Entrega' })).toBeNull();
    expect(loadPreview).not.toHaveBeenCalled();

    const list = await screen.findByRole(
      'list',
      { name: 'Ficheiros de Entrega' },
      { timeout: 2000 },
    );
    expect(list.textContent).toContain('briefing.pdf');
    expect(await screen.findByText('logotipo.png')).toBeTruthy();
    expect(loadPreview).toHaveBeenCalledWith('t1');
  });

  it('does not open on keyboard focus', async () => {
    const user = userEvent.setup();
    const loadPreview = renderPreview();

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Entrega' }));
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(screen.queryByRole('list', { name: 'Ficheiros de Entrega' })).toBeNull();
    expect(loadPreview).not.toHaveBeenCalled();
  });

  it('shows only the trigger when the task has no files', async () => {
    const user = userEvent.setup();
    const loadPreview = renderPreview(undefined, 0);

    await user.hover(screen.getByRole('button', { name: 'Entrega' }));
    await new Promise((resolve) => setTimeout(resolve, 500));

    await waitFor(() => expect(screen.queryByRole('list')).toBeNull());
    expect(loadPreview).not.toHaveBeenCalled();
  });
});
