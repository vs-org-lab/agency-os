// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { MotionProvider } from '@agency-os/ui/motion';
import type { LibraryView } from '@/modules/library';
import { AttachmentPicker } from './attachment-picker';
import { LibraryBrowser, type LibraryActions, type LibraryParams } from './library-browser';

const push = vi.fn();
const replace = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push, replace, refresh: vi.fn() }),
}));

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  push.mockReset();
  replace.mockReset();
  vi.unstubAllGlobals();
});

const FOLDER_VIEW: LibraryView = {
  projects: [{ id: 'project-1', name: 'Website', status: 'active' }],
  projectId: 'project-1',
  folder: { id: 'folder-1', name: 'Marca', visibility: 'client', trail: [] },
  folders: [{ id: 'folder-2', name: 'Logótipos', visibility: 'client', fileCount: 3 }],
  files: [
    {
      id: 'file-1',
      name: 'manual.png',
      kind: 'image',
      sizeBytes: 2_500_000,
      createdAt: '2026-10-10T10:00:00.000Z',
      uploadedByName: 'Ana Costa',
      folderName: null,
      canDelete: true,
    },
  ],
  canWrite: true,
  canCreateRoot: true,
};

function actions(overrides: Partial<LibraryActions> = {}): LibraryActions {
  return {
    createFolder: vi.fn(async () => ({ ok: true as const })),
    renameFolder: vi.fn(async () => ({ ok: true as const })),
    setVisibility: vi.fn(async () => ({ ok: true as const })),
    deleteFolder: vi.fn(async () => ({ ok: true as const })),
    startUploads: vi.fn(async () => ({ ok: true as const, uploads: [] })),
    finishUpload: vi.fn(async () => ({ ok: true as const })),
    deleteFile: vi.fn(async () => ({ ok: true as const })),
    zip: vi.fn(async () => ({ ok: true as const, archiveName: 'Marca.zip', entries: [] })),
    ...overrides,
  };
}

function renderBrowser(
  view: LibraryView,
  params: LibraryParams,
  libraryActions: LibraryActions = actions(),
  audience: 'staff' | 'portal' = 'staff',
) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <MotionProvider>
        <LibraryBrowser
          view={view}
          basePath="/c/client-1/library"
          params={params}
          actions={libraryActions}
          audience={audience}
        />
      </MotionProvider>
    </NextIntlClientProvider>,
  );
}

describe('LibraryBrowser', () => {
  it('the browser switches between grid and list from the URL', () => {
    renderBrowser(FOLDER_VIEW, { folder: 'folder-1' });
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('link', { name: 'Lista' }).getAttribute('href')).toBe(
      '/c/client-1/library?folder=folder-1&view=list',
    );
    cleanup();

    renderBrowser(FOLDER_VIEW, { folder: 'folder-1', view: 'list' });
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'manual.png' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Grelha' }).getAttribute('href')).toBe(
      '/c/client-1/library?folder=folder-1',
    );
  });

  it('filters and search update the URL', () => {
    renderBrowser(FOLDER_VIEW, { project: 'project-1', folder: 'folder-1', sort: 'size' });
    expect(screen.getByRole('link', { name: 'Imagens' }).getAttribute('href')).toBe(
      '/c/client-1/library?project=project-1&kind=image&sort=size',
    );
    expect(screen.getByRole('link', { name: 'Pastas' }).getAttribute('href')).toBe(
      '/c/client-1/library?project=project-1&folder=folder-1&kind=folders&sort=size',
    );
    expect(screen.getByRole('link', { name: /^Logótipos/ }).getAttribute('href')).toBe(
      '/c/client-1/library?project=project-1&folder=folder-2&sort=size',
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Pesquisar ficheiros' }), {
      target: { value: ' logo ' },
    });
  });

  it('searches without a button after typing stops', () => {
    vi.useFakeTimers();
    renderBrowser(FOLDER_VIEW, { project: 'project-1', folder: 'folder-1', sort: 'size' });
    expect(screen.queryByRole('button', { name: 'Pesquisar' })).toBeNull();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Pesquisar ficheiros' }), {
      target: { value: ' logo ' },
    });
    act(() => vi.advanceTimersByTime(249));
    expect(replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(replace).toHaveBeenCalledWith('/c/client-1/library?project=project-1&q=logo&sort=size');
    expect(push).not.toHaveBeenCalled();
  });

  it('follows the search term when the url changes from outside', () => {
    const element = (params: LibraryParams) => (
      <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
        <MotionProvider>
          <LibraryBrowser
            view={FOLDER_VIEW}
            basePath="/c/client-1/library"
            params={params}
            actions={actions()}
            audience="staff"
          />
        </MotionProvider>
      </NextIntlClientProvider>
    );
    const { rerender } = render(element({ folder: 'folder-1', q: 'logo' }));
    const box = screen.getByRole('searchbox', { name: 'Pesquisar ficheiros' }) as HTMLInputElement;
    expect(box.value).toBe('logo');

    rerender(element({ folder: 'folder-1' }));

    expect(box.value).toBe('');
  });

  it('shows the drop layer on dragenter and hides on drop', async () => {
    renderBrowser(FOLDER_VIEW, { folder: 'folder-1' });
    const area = screen.getByRole('navigation', { name: 'Caminho da pasta' });
    expect(screen.queryByText('Largue os ficheiros para carregar')).toBeNull();
    fireEvent.dragEnter(area, { dataTransfer: { types: ['Files'], files: [] } });
    expect(screen.getByText('Largue os ficheiros para carregar')).toBeTruthy();
    fireEvent.drop(area, { dataTransfer: { types: ['Files'], files: [] } });
    await waitFor(() => expect(screen.queryByText('Largue os ficheiros para carregar')).toBeNull());
  });

  it('dropped files go through the same validation as the upload button', async () => {
    const libraryActions = actions({
      startUploads: vi.fn(async () => ({ ok: false as const, code: 'invalid_file' })),
    });
    renderBrowser(FOLDER_VIEW, { folder: 'folder-1' }, libraryActions);
    const file = new File(['x'], 'script.exe', { type: 'application/x-msdownload' });
    fireEvent.drop(screen.getByRole('navigation', { name: 'Caminho da pasta' }), {
      dataTransfer: { types: ['Files'], files: [file] },
    });
    await waitFor(() => expect(screen.getByText(/O ficheiro foi recusado/)).toBeTruthy());
    expect(libraryActions.startUploads).toHaveBeenCalledWith('folder-1', [
      { path: 'script.exe', sizeBytes: 1 },
    ]);
  });

  it('upload button only inside a folder', () => {
    renderBrowser({ ...FOLDER_VIEW, folder: null }, {});
    expect(screen.queryByLabelText('Carregar ficheiros')).toBeNull();
    cleanup();
    renderBrowser(FOLDER_VIEW, { folder: 'folder-1' });
    expect(screen.getByLabelText('Carregar ficheiros')).toBeTruthy();
  });

  it('actions follow permissions', () => {
    renderBrowser(FOLDER_VIEW, { folder: 'folder-1' });
    expect(screen.getByRole('button', { name: 'Nova pasta' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apagar manual.png' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tornar interna' })).toBeTruthy();
    expect(screen.getByLabelText('Carregar ficheiros')).toBeTruthy();
    cleanup();

    renderBrowser(
      {
        ...FOLDER_VIEW,
        canWrite: false,
        canCreateRoot: false,
        files: FOLDER_VIEW.files.map((file) => ({ ...file, canDelete: false })),
      },
      { folder: 'folder-1' },
      actions(),
      'portal',
    );
    expect(screen.queryByRole('button', { name: 'Nova pasta' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apagar manual.png' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tornar interna' })).toBeNull();
    expect(screen.queryByLabelText('Carregar ficheiros')).toBeNull();
    expect(screen.getByRole('link', { name: 'Descarregar manual.png' }).getAttribute('href')).toBe(
      '/api/library/files/file-1',
    );
    expect(screen.getByRole('button', { name: 'Descarregar pasta' })).toBeTruthy();
  });

  it('refusals show their message', async () => {
    const libraryActions = actions({
      startUploads: vi.fn(async () => ({ ok: false as const, code: 'storage_full' })),
    });
    renderBrowser(FOLDER_VIEW, { folder: 'folder-1' }, libraryActions);

    fireEvent.change(screen.getByLabelText('Carregar ficheiros'), {
      target: { files: [new File(['x'], 'capa.png', { type: 'image/png' })] },
    });
    await waitFor(() =>
      expect(screen.getByText(/O espaço de armazenamento está quase cheio/)).toBeTruthy(),
    );
    expect(libraryActions.startUploads).toHaveBeenCalledWith('folder-1', [
      { path: 'capa.png', sizeBytes: 1 },
    ]);
  });
});

describe('AttachmentPicker', () => {
  const files = Array.from({ length: 12 }, (_, index) => ({
    id: `file-${index}`,
    name: `ficheiro-${String(index).padStart(2, '0')}.png`,
    folderName: index === 0 ? 'Interno' : 'Marca',
    visibility: index === 0 ? ('internal' as const) : ('client' as const),
  }));

  it('the attachment picker limits to ten files', () => {
    const onChange = vi.fn();
    const selected = files.slice(0, 10).map((file) => file.id);
    render(
      <NextIntlClientProvider locale="pt-PT" messages={messages}>
        <AttachmentPicker
          files={files}
          selected={selected}
          onChange={onChange}
          visibility="client"
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText(/10 de 10 selecionados/)).toBeTruthy();
    const eleventh = screen.getByRole('checkbox', { name: /ficheiro-10\.png/ }) as HTMLInputElement;
    expect(eleventh.disabled).toBe(true);
    expect(screen.getByText(/Há ficheiros de pastas internas selecionados/)).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /ficheiro-01\.png/ }));
    expect(onChange).toHaveBeenCalledWith(selected.filter((id) => id !== 'file-1'));
  });
});
