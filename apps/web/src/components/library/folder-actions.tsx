'use client';

import { useId, useState, useTransition } from 'react';
import { FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import { libraryError, type LibraryError } from './library-errors';
import type { ActionResult } from './upload-files';

function useLibraryAction() {
  const [error, setError] = useState<LibraryError | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ActionResult>, onDone?: () => void) =>
    startTransition(async () => {
      const result = await action().catch(() => ({ ok: false, code: 'not_found' }) as const);
      if (result.ok) {
        setError(null);
        onDone?.();
      } else {
        setError(libraryError(result.code));
      }
    });
  return { error, setError, pending, run };
}

function ErrorMessage({ error }: { error: LibraryError | null }) {
  const t = useTranslations('library.errors');
  return error ? <FormMessage tone="danger">{t(error)}</FormMessage> : null;
}

/** A single folder name form, used to create and to rename. */
function NameForm({
  label,
  submitLabel,
  initial,
  onSubmit,
  onCancel,
}: {
  label: string;
  submitLabel: string;
  initial: string;
  onSubmit: (name: string) => Promise<ActionResult>;
  onCancel: () => void;
}) {
  const t = useTranslations('library');
  const id = useId();
  const [name, setName] = useState(initial);
  const { error, setError, pending, run } = useLibraryAction();
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => onSubmit(name), onCancel);
      }}
    >
      <div className="flex flex-col gap-1 sm:w-72">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          required
          maxLength={120}
          autoFocus
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || name.trim() === ''}>
          {submitLabel}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </div>
      <ErrorMessage error={error} />
    </form>
  );
}

export function NewFolderButton({
  create,
  onCreated,
}: {
  create: (name: string) => Promise<ActionResult>;
  onCreated: () => void;
}) {
  const t = useTranslations('library');
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <NameForm
        label={t('folderName')}
        submitLabel={t('create')}
        initial=""
        onSubmit={async (name) => {
          const result = await create(name);
          if (result.ok) onCreated();
          return result;
        }}
        onCancel={() => setOpen(false)}
      />
    );
  }
  return (
    <Button type="button" size="sm" onClick={() => setOpen(true)}>
      <FolderPlus aria-hidden="true" />
      {t('newFolder')}
    </Button>
  );
}

/** Rename, visibility (roots only) and deletion of the open folder, for the team. */
export function CurrentFolderActions({
  folder,
  isRoot,
  rename,
  setVisibility,
  remove,
  onChanged,
  onRemoved,
}: {
  folder: { id: string; name: string; visibility: 'internal' | 'client' };
  isRoot: boolean;
  rename: (folderId: string, name: string) => Promise<ActionResult>;
  setVisibility: (folderId: string, visibility: 'internal' | 'client') => Promise<ActionResult>;
  remove: (folderId: string) => Promise<ActionResult>;
  onChanged: () => void;
  onRemoved: () => void;
}) {
  const t = useTranslations('library');
  const [renaming, setRenaming] = useState(false);
  const { error, pending, run } = useLibraryAction();

  if (renaming) {
    return (
      <NameForm
        label={t('folderName')}
        submitLabel={t('save')}
        initial={folder.name}
        onSubmit={async (name) => {
          const result = await rename(folder.id, name);
          if (result.ok) onChanged();
          return result;
        }}
        onCancel={() => setRenaming(false)}
      />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setRenaming(true)}>
          <Pencil aria-hidden="true" />
          {t('rename')}
        </Button>
        {isRoot ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  setVisibility(folder.id, folder.visibility === 'client' ? 'internal' : 'client'),
                onChanged,
              )
            }
          >
            {folder.visibility === 'client'
              ? t('visibility.makeInternal')
              : t('visibility.makeClient')}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(t('confirmDeleteFolder', { name: folder.name }))) return;
            run(() => remove(folder.id), onRemoved);
          }}
        >
          <Trash2 aria-hidden="true" />
          {t('deleteFolder')}
        </Button>
      </div>
      {isRoot ? (
        <p className="text-caption text-text-secondary">{t('visibility.inherited')}</p>
      ) : null}
      <ErrorMessage error={error} />
    </div>
  );
}
