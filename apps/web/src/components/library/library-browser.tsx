'use client';

import { useId, useState, useTransition } from 'react';
import { ChevronRight, FolderUp, LayoutGrid, List, Search, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Input } from '@agency-os/ui/components/input';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { cn } from '@agency-os/ui/lib/utils';
import { FormMessage } from '@/components/forms/form-message';
import { Link, useRouter } from '@/i18n/navigation';
import type { FileView, LibraryKindFilter, LibrarySort, LibraryView } from '@/modules/library';
import { CurrentFolderActions, NewFolderButton } from './folder-actions';
import { libraryError, type LibraryError } from './library-errors';
import { folderHref, kindHref, libraryHref, searchHref, type LibraryParams } from './library-href';
import { LibraryGrid, LibraryList } from './library-items';
import {
  uploadFiles,
  type ActionResult,
  type StartUploads,
  type UploadOutcome,
} from './upload-files';
import { ZipDownload, type RequestZip } from './zip-download';

export type { LibraryParams } from './library-href';

export type LibraryActions = {
  createFolder?: (input: {
    projectId: string;
    parentId: string | null;
    name: string;
  }) => Promise<ActionResult>;
  renameFolder?: (folderId: string, name: string) => Promise<ActionResult>;
  setVisibility?: (folderId: string, visibility: 'internal' | 'client') => Promise<ActionResult>;
  deleteFolder?: (folderId: string) => Promise<ActionResult>;
  startUploads: StartUploads;
  finishUpload: (fileId: string) => Promise<ActionResult>;
  deleteFile: (fileId: string) => Promise<ActionResult>;
  zip: RequestZip;
};

const KIND_FILTERS: ReadonlyArray<LibraryKindFilter | undefined> = [
  undefined,
  'folders',
  'image',
  'video',
  'document',
];

const SORTS: readonly LibrarySort[] = ['name', 'date', 'size'];

const CHIP =
  'inline-flex items-center gap-1 rounded-md border border-border px-3 py-1 text-body-sm text-text hover:border-text aria-[current=page]:border-text aria-[current=page]:bg-surface-muted';

type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; done: number; total: number }
  | { phase: 'done'; outcome: UploadOutcome };

function UploadControls({
  folderId,
  actions,
  onUploaded,
}: {
  folderId: string;
  actions: LibraryActions;
  onUploaded: () => void;
}) {
  const t = useTranslations('library');
  const id = useId();
  const [state, setState] = useState<UploadState>({ phase: 'idle' });
  const busy = state.phase === 'uploading';

  const upload = async (list: FileList | null, input: HTMLInputElement) => {
    const files = list ? Array.from(list) : [];
    input.value = '';
    if (files.length === 0) return;
    const outcome = await uploadFiles(folderId, files, actions, (done, total) =>
      setState({ phase: 'uploading', done, total }),
    );
    setState({ phase: 'done', outcome });
    if (outcome.uploaded > 0) onUploaded();
  };

  const error: LibraryError | null =
    state.phase === 'done' && state.outcome.error ? libraryError(state.outcome.error) : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <label
          className={cn(CHIP, 'cursor-pointer focus-within:outline-2', busy && 'opacity-60')}
          htmlFor={`${id}-files`}
        >
          <Upload aria-hidden="true" className="size-4" />
          {t('upload')}
          <input
            id={`${id}-files`}
            type="file"
            multiple
            disabled={busy}
            className="sr-only"
            aria-describedby={`${id}-hint`}
            onChange={(event) => void upload(event.target.files, event.target)}
          />
        </label>
        <label
          className={cn(CHIP, 'cursor-pointer focus-within:outline-2', busy && 'opacity-60')}
          htmlFor={`${id}-folder`}
        >
          <FolderUp aria-hidden="true" className="size-4" />
          {t('uploadFolder')}
          <input
            id={`${id}-folder`}
            type="file"
            multiple
            disabled={busy}
            className="sr-only"
            aria-describedby={`${id}-hint`}
            ref={(input) => input?.setAttribute('webkitdirectory', '')}
            onChange={(event) => void upload(event.target.files, event.target)}
          />
        </label>
      </div>
      <p id={`${id}-hint`} className="text-caption text-text-secondary">
        {t('uploadHint')}
      </p>
      <div aria-live="polite" className="flex flex-col gap-1">
        {state.phase === 'uploading' ? (
          <FormMessage tone="info">
            {t('uploading', { done: state.done, total: state.total })}
          </FormMessage>
        ) : null}
        {state.phase === 'done' && state.outcome.uploaded > 0 ? (
          <FormMessage tone="success">
            {t('uploaded', { count: state.outcome.uploaded })}
          </FormMessage>
        ) : null}
        {state.phase === 'done' && state.outcome.rejected > 0 ? (
          <FormMessage tone="danger">
            {t('rejected', { count: state.outcome.rejected })}
          </FormMessage>
        ) : null}
        {error ? <FormMessage tone="danger">{t(`errors.${error}`)}</FormMessage> : null}
      </div>
    </div>
  );
}

function Toolbar({ basePath, params }: { basePath: string; params: LibraryParams }) {
  const t = useTranslations('library');
  const router = useRouter();
  const id = useId();
  const [query, setQuery] = useState(params.q ?? '');
  const view = params.view ?? 'grid';
  return (
    <div className="flex flex-col gap-3">
      <form
        role="search"
        className="flex gap-2 md:w-96"
        onSubmit={(event) => {
          event.preventDefault();
          router.push(searchHref(basePath, params, query));
        }}
      >
        <label htmlFor={`${id}-search`} className="sr-only">
          {t('search')}
        </label>
        <Input
          id={`${id}-search`}
          type="search"
          value={query}
          placeholder={t('search')}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit" className={CHIP} aria-label={t('searchSubmit')}>
          <Search aria-hidden="true" className="size-4" />
        </button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t('filters.label')}>
          <ul className="flex flex-wrap gap-2">
            {KIND_FILTERS.map((kind) => (
              <li key={kind ?? 'all'}>
                <Link
                  href={kindHref(basePath, params, kind)}
                  aria-current={params.kind === kind ? 'page' : undefined}
                  className={CHIP}
                >
                  {t(`filters.${kind ?? 'all'}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <nav aria-label={t('sort.label')}>
            <ul className="flex gap-2">
              {SORTS.map((sort) => (
                <li key={sort}>
                  <Link
                    href={libraryHref(basePath, params, {
                      sort: sort === 'name' ? undefined : sort,
                    })}
                    aria-current={(params.sort ?? 'name') === sort ? 'page' : undefined}
                    className={CHIP}
                  >
                    {t(`sort.${sort}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label={t('view.label')}>
            <ul className="flex gap-2">
              <li>
                <Link
                  href={libraryHref(basePath, params, { view: undefined })}
                  aria-current={view === 'grid' ? 'page' : undefined}
                  className={CHIP}
                >
                  <LayoutGrid aria-hidden="true" className="size-4" />
                  {t('view.grid')}
                </Link>
              </li>
              <li>
                <Link
                  href={libraryHref(basePath, params, { view: 'list' })}
                  aria-current={view === 'list' ? 'page' : undefined}
                  className={CHIP}
                >
                  <List aria-hidden="true" className="size-4" />
                  {t('view.list')}
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </div>
  );
}

/**
 * C-06 and P-04: the library of a project, with folder navigation, filters, search, sorting, grid
 * or list, uploads and downloads. Every state lives in the URL; actions appear only where the
 * viewer may use them.
 */
export function LibraryBrowser({
  view,
  basePath,
  params,
  actions,
  audience,
}: {
  view: LibraryView;
  basePath: string;
  params: LibraryParams;
  actions: LibraryActions;
  audience: 'staff' | 'portal';
}) {
  const t = useTranslations('library');
  const router = useRouter();
  const [fileError, setFileError] = useState<LibraryError | null>(null);
  const [, startTransition] = useTransition();
  const refresh = () => router.refresh();
  const { folder, projectId } = view;
  const spansProject =
    Boolean(params.q) || (params.kind !== undefined && params.kind !== 'folders');
  const canCreateFolder =
    actions.createFolder !== undefined &&
    (view.canCreateRoot || (view.canWrite && folder !== null));
  const isTeam = audience === 'staff' && view.canCreateRoot;

  const deleteFile = (file: FileView) => {
    if (!window.confirm(t('confirmDeleteFile', { name: file.name }))) return;
    startTransition(async () => {
      const result = await actions
        .deleteFile(file.id)
        .catch(() => ({ ok: false, code: 'not_found' }) as const);
      setFileError(result.ok ? null : libraryError(result.code));
      if (result.ok) refresh();
    });
  };

  const empty = view.folders.length === 0 && view.files.length === 0;
  const itemsProps = {
    folders: view.folders,
    files: view.files,
    folderLink: (folderId: string) => folderHref(basePath, params, folderId),
    showVisibility: audience === 'staff',
    onDeleteFile: deleteFile,
  };

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label={t('breadcrumb')}>
        <ol className="flex flex-wrap items-center gap-1 text-body-sm">
          <li>
            <Link href={folderHref(basePath, params)} className="text-link hover:underline">
              {t('title')}
            </Link>
          </li>
          {folder?.trail.map((ancestor) => (
            <li key={ancestor.id} className="flex items-center gap-1">
              <ChevronRight aria-hidden="true" className="size-4 text-text-tertiary" />
              <Link
                href={folderHref(basePath, params, ancestor.id)}
                className="text-link hover:underline"
              >
                {ancestor.name}
              </Link>
            </li>
          ))}
          {folder ? (
            <li className="flex items-center gap-1" aria-current="page">
              <ChevronRight aria-hidden="true" className="size-4 text-text-tertiary" />
              <span className="text-text">{folder.name}</span>
              {audience === 'staff' ? (
                <Badge variant={folder.visibility === 'client' ? 'secondary' : 'outline'}>
                  {t(`visibility.${folder.visibility}`)}
                </Badge>
              ) : null}
            </li>
          ) : null}
        </ol>
      </nav>

      <Toolbar basePath={basePath} params={params} />

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-start gap-3">
            {canCreateFolder && projectId && actions.createFolder ? (
              <NewFolderButton
                create={(name) =>
                  actions.createFolder
                    ? actions.createFolder({ projectId, parentId: folder?.id ?? null, name })
                    : Promise.resolve({ ok: false, code: 'not_found' })
                }
                onCreated={refresh}
              />
            ) : null}
            {folder &&
            isTeam &&
            actions.renameFolder &&
            actions.setVisibility &&
            actions.deleteFolder ? (
              <CurrentFolderActions
                folder={folder}
                isRoot={folder.trail.length === 0}
                rename={actions.renameFolder}
                setVisibility={actions.setVisibility}
                remove={actions.deleteFolder}
                onChanged={refresh}
                onRemoved={() => router.push(folderHref(basePath, params, folder.trail.at(-1)?.id))}
              />
            ) : null}
          </div>
          {projectId ? (
            <ZipDownload
              projectId={projectId}
              folderId={folder?.id ?? null}
              requestZip={actions.zip}
            />
          ) : null}
        </div>
        {view.canWrite && folder ? (
          <UploadControls folderId={folder.id} actions={actions} onUploaded={refresh} />
        ) : null}
        {view.canWrite && !folder && view.canCreateRoot ? (
          <p className="text-caption text-text-secondary">{t('openFolderToUpload')}</p>
        ) : null}
      </div>

      {fileError ? <FormMessage tone="danger">{t(`errors.${fileError}`)}</FormMessage> : null}

      {empty ? (
        spansProject ? (
          <p className="text-body-sm text-text-secondary">{t('noResults')}</p>
        ) : folder ? (
          <p className="text-body-sm text-text-secondary">{t('empty')}</p>
        ) : audience === 'portal' ? (
          <EmptyState title={t('emptyPortal')} description="" />
        ) : (
          <EmptyState title={t('emptyRoot')} description={t('emptyRootHint')} />
        )
      ) : (params.view ?? 'grid') === 'list' ? (
        <LibraryList {...itemsProps} />
      ) : (
        <LibraryGrid {...itemsProps} />
      )}
    </div>
  );
}
