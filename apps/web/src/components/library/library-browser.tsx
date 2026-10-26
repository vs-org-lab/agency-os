'use client';

import { useEffect, useId, useState, useTransition, type ReactNode } from 'react';
import { ChevronRight, Folder, FolderUp, LayoutGrid, List, Search, Upload, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { buttonVariants } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { cn } from '@agency-os/ui/lib/utils';
import { AnimatePresence, m, transitions } from '@agency-os/ui/motion';
import { FormMessage } from '@/components/forms/form-message';
import { SelectField } from '@/components/forms/select-field';
import { Link, useRouter } from '@/i18n/navigation';
import type {
  FileView,
  FolderView,
  LibraryKindFilter,
  LibrarySort,
  LibraryView,
} from '@/modules/library';
import { DropLayer } from './drop-layer';
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

const SEARCH_DEBOUNCE_MS = 250;

const CHIP =
  'inline-flex items-center gap-1 rounded-md border border-border px-3 py-1 text-body-sm text-text hover:border-text aria-[current=page]:border-text aria-[current=page]:bg-surface-muted';

type UploadItem = { id: number; name: string; status: 'pending' | 'done' | 'failed' };

type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; done: number; total: number }
  | { phase: 'done'; outcome: UploadOutcome };

/** The upload path shared by the file inputs and by dropped files. */
function useUploads(folderId: string | null, actions: LibraryActions, onUploaded: () => void) {
  const [state, setState] = useState<UploadState>({ phase: 'idle' });
  const [items, setItems] = useState<UploadItem[]>([]);

  const upload = async (files: File[]) => {
    if (!folderId || files.length === 0 || state.phase === 'uploading') return;
    const ids = new Map(files.map((file, index) => [file, index]));
    setItems(files.map((file, index) => ({ id: index, name: file.name, status: 'pending' })));
    const settle = (id: number | undefined, status: UploadItem['status']) =>
      setItems((current) =>
        current.map((item) =>
          item.id === id && item.status === 'pending' ? { ...item, status } : item,
        ),
      );
    const outcome = await uploadFiles(
      folderId,
      files,
      actions,
      (done, total) => setState({ phase: 'uploading', done, total }),
      (file, status) => settle(ids.get(file), status),
    );
    setItems((current) =>
      current.map((item) => (item.status === 'pending' ? { ...item, status: 'failed' } : item)),
    );
    setState({ phase: 'done', outcome });
    if (outcome.uploaded > 0) onUploaded();
  };

  return { state, items, upload, clearItems: () => setItems([]) };
}

function UploadControls({
  busy,
  onFiles,
  describedBy,
}: {
  busy: boolean;
  onFiles: (files: File[]) => void;
  describedBy: string;
}) {
  const t = useTranslations('library');
  const id = useId();
  const pick = (list: FileList | null, input: HTMLInputElement) => {
    const files = list ? Array.from(list) : [];
    input.value = '';
    onFiles(files);
  };
  return (
    <>
      <label
        className={cn(
          buttonVariants({ size: 'sm' }),
          'cursor-pointer focus-within:outline-2',
          busy && 'opacity-60',
        )}
        htmlFor={`${id}-files`}
      >
        <Upload aria-hidden="true" />
        {t('upload')}
        <input
          id={`${id}-files`}
          type="file"
          multiple
          disabled={busy}
          className="sr-only"
          aria-describedby={describedBy}
          onChange={(event) => pick(event.target.files, event.target)}
        />
      </label>
      <label
        className={cn(
          buttonVariants({ size: 'sm', variant: 'outline' }),
          'cursor-pointer focus-within:outline-2',
          busy && 'opacity-60',
        )}
        htmlFor={`${id}-folder`}
      >
        <FolderUp aria-hidden="true" />
        {t('uploadFolder')}
        <input
          id={`${id}-folder`}
          type="file"
          multiple
          disabled={busy}
          className="sr-only"
          aria-describedby={describedBy}
          ref={(input) => input?.setAttribute('webkitdirectory', '')}
          onChange={(event) => pick(event.target.files, event.target)}
        />
      </label>
    </>
  );
}

function UploadMessages({ state }: { state: UploadState }) {
  const t = useTranslations('library');
  const error: LibraryError | null =
    state.phase === 'done' && state.outcome.error ? libraryError(state.outcome.error) : null;
  return (
    <div aria-live="polite" className="flex flex-col gap-1">
      {state.phase === 'uploading' ? (
        <FormMessage tone="info">
          {t('uploading', { done: state.done, total: state.total })}
        </FormMessage>
      ) : null}
      {state.phase === 'done' && state.outcome.uploaded > 0 ? (
        <FormMessage tone="success">{t('uploaded', { count: state.outcome.uploaded })}</FormMessage>
      ) : null}
      {state.phase === 'done' && state.outcome.rejected > 0 ? (
        <FormMessage tone="danger">{t('rejected', { count: state.outcome.rejected })}</FormMessage>
      ) : null}
      {error ? <FormMessage tone="danger">{t(`errors.${error}`)}</FormMessage> : null}
    </div>
  );
}

/** Per-file progress, fixed at the bottom of the screen while files are being sent. */
function UploadProgress({ items, onClear }: { items: UploadItem[]; onClear: () => void }) {
  const t = useTranslations('library');
  const closeLabel = useTranslations('interaction')('close');
  const finished = items.length > 0 && items.every((item) => item.status !== 'pending');
  return (
    <AnimatePresence>
      {items.length > 0 ? (
        <m.section
          key="upload-progress"
          aria-label={t('progressLabel')}
          className="fixed inset-x-4 bottom-4 z-30 flex max-h-64 flex-col gap-2 overflow-y-auto rounded-lg border border-border bg-surface p-3 shadow-lg sm:left-auto sm:w-80"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={transitions.base}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-label text-text">{t('progressLabel')}</h2>
            {finished ? (
              <button
                type="button"
                aria-label={closeLabel}
                className="rounded-sm p-1 text-text-secondary hover:text-text"
                onClick={onClear}
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            ) : null}
          </div>
          <ul className="flex flex-col gap-1">
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <m.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-between gap-2 text-body-sm"
                >
                  <span className="truncate text-text">{item.name}</span>
                  <span
                    className={cn(
                      'shrink-0 text-caption',
                      item.status === 'failed' ? 'text-danger' : 'text-text-secondary',
                    )}
                  >
                    {t(`fileStatus.${item.status}`)}
                  </span>
                </m.li>
              ))}
            </AnimatePresence>
          </ul>
        </m.section>
      ) : null}
    </AnimatePresence>
  );
}

function Toolbar({
  basePath,
  params,
  actionsSlot,
}: {
  basePath: string;
  params: LibraryParams;
  actionsSlot: ReactNode;
}) {
  const t = useTranslations('library');
  const router = useRouter();
  const id = useId();
  const [query, setQuery] = useState(params.q ?? '');
  const view = params.view ?? 'grid';
  const sortOptions = SORTS.map((sort) => ({ value: sort, label: t(`sort.${sort}`) }));

  // A term changed outside the box (a link, the back button) replaces what is typed.
  useEffect(() => {
    setQuery((current) => ((params.q ?? '') === current.trim() ? current : (params.q ?? '')));
  }, [params.q]);

  // The search follows the URL once typing pauses, so it needs no submit button.
  useEffect(() => {
    if (query.trim() === (params.q ?? '')) return;
    const timer = setTimeout(
      () => router.replace(searchHref(basePath, params, query)),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <form
          role="search"
          className="relative min-w-48 flex-1 md:max-w-96"
          onSubmit={(event) => {
            event.preventDefault();
            router.push(searchHref(basePath, params, query));
          }}
        >
          <label htmlFor={`${id}-search`} className="sr-only">
            {t('search')}
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-tertiary"
          />
          <Input
            id={`${id}-search`}
            type="search"
            value={query}
            placeholder={t('search')}
            className="pl-9"
            onChange={(event) => setQuery(event.target.value)}
          />
        </form>
        <SelectField
          label={t('sort.label')}
          value={params.sort ?? 'name'}
          options={sortOptions}
          className="w-40"
          onValueChange={(sort) =>
            router.push(libraryHref(basePath, params, { sort: sort === 'name' ? undefined : sort }))
          }
        />
        <nav aria-label={t('view.label')}>
          <ul className="flex gap-1">
            <li>
              <Link
                href={libraryHref(basePath, params, { view: undefined })}
                aria-current={view === 'grid' ? 'page' : undefined}
                className={cn(CHIP, 'px-2')}
              >
                <LayoutGrid aria-hidden="true" className="size-4" />
                <span className="sr-only">{t('view.grid')}</span>
              </Link>
            </li>
            <li>
              <Link
                href={libraryHref(basePath, params, { view: 'list' })}
                aria-current={view === 'list' ? 'page' : undefined}
                className={cn(CHIP, 'px-2')}
              >
                <List aria-hidden="true" className="size-4" />
                <span className="sr-only">{t('view.list')}</span>
              </Link>
            </li>
          </ul>
        </nav>
        <div className="flex flex-wrap items-center gap-2 md:ml-auto">{actionsSlot}</div>
      </div>
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
    </div>
  );
}

function FolderChips({
  folders,
  folderLink,
  showVisibility,
}: {
  folders: FolderView[];
  folderLink: (folderId: string) => string;
  showVisibility: boolean;
}) {
  const t = useTranslations('library');
  if (folders.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {folders.map((folder) => (
        <li key={folder.id}>
          <Link href={folderLink(folder.id)} className={CHIP}>
            <Folder aria-hidden="true" className="size-4 text-text-secondary" />
            {folder.name}
            <span className="text-caption text-text-secondary">{folder.fileCount}</span>
            {showVisibility && folder.visibility === 'internal' ? (
              <span className="sr-only">{t('visibility.internal')}</span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
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
  const hintId = useId();
  const router = useRouter();
  const [fileError, setFileError] = useState<LibraryError | null>(null);
  const [, startTransition] = useTransition();
  const refresh = () => router.refresh();
  const { folder, projectId } = view;
  const uploads = useUploads(folder?.id ?? null, actions, refresh);
  const spansProject =
    Boolean(params.q) || (params.kind !== undefined && params.kind !== 'folders');
  const canCreateFolder =
    actions.createFolder !== undefined &&
    (view.canCreateRoot || (view.canWrite && folder !== null));
  const isTeam = audience === 'staff' && view.canCreateRoot;
  const canUpload = view.canWrite && folder !== null;

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
    files: view.files,
    onDeleteFile: deleteFile,
  };

  const folderAdmin =
    folder && isTeam && actions.renameFolder && actions.setVisibility && actions.deleteFolder ? (
      <CurrentFolderActions
        folder={folder}
        isRoot={folder.trail.length === 0}
        rename={actions.renameFolder}
        setVisibility={actions.setVisibility}
        remove={actions.deleteFolder}
        onChanged={refresh}
        onRemoved={() => router.push(folderHref(basePath, params, folder.trail.at(-1)?.id))}
      />
    ) : null;

  const toolbarActions = (
    <>
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
      {canUpload ? (
        <UploadControls
          busy={uploads.state.phase === 'uploading'}
          onFiles={(files) => void uploads.upload(files)}
          describedBy={hintId}
        />
      ) : null}
    </>
  );

  return (
    <DropLayer
      enabled={canUpload}
      onFiles={(files) => void uploads.upload(files)}
      label={t('dropHere')}
    >
      <div className="flex flex-col gap-4">
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

        <Toolbar basePath={basePath} params={params} actionsSlot={toolbarActions} />

        {canUpload ? (
          <p id={hintId} className="text-caption text-text-secondary">
            {t('uploadHint')}
          </p>
        ) : null}
        {view.canWrite && !folder && view.canCreateRoot ? (
          <p className="text-caption text-text-secondary">{t('openFolderToUpload')}</p>
        ) : null}
        <UploadMessages state={uploads.state} />

        {folderAdmin || projectId ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            {folderAdmin}
            {projectId ? (
              <ZipDownload
                projectId={projectId}
                folderId={folder?.id ?? null}
                requestZip={actions.zip}
              />
            ) : null}
          </div>
        ) : null}

        {fileError ? <FormMessage tone="danger">{t(`errors.${fileError}`)}</FormMessage> : null}

        <FolderChips
          folders={view.folders}
          folderLink={(folderId) => folderHref(basePath, params, folderId)}
          showVisibility={audience === 'staff'}
        />

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
        ) : view.files.length === 0 ? null : (params.view ?? 'grid') === 'list' ? (
          <LibraryList {...itemsProps} />
        ) : (
          <LibraryGrid {...itemsProps} />
        )}
      </div>
      <UploadProgress items={uploads.items} onClear={uploads.clearItems} />
    </DropLayer>
  );
}
