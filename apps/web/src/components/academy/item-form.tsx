'use client';

import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { AcademyItemKind } from '@agency-os/db';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import type { ItemSource, RoomAcademyItem, RoomAcademyView } from '@/modules/academy';
import { academyError, linesOf, SELECT, type AcademyError } from './shared';

export type SaveItem = (input: {
  clientId: string;
  itemId?: string;
  kind: AcademyItemKind;
  title: string;
  description: string;
  source: ItemSource | null;
  steps: string[];
}) => Promise<{ ok: true; itemId: string } | { ok: false; code: string }>;

const KINDS: AcademyItemKind[] = ['tutorial', 'manual', 'checklist'];

/** C-12: a new academy item or the edit of one; the kind is fixed once the item exists. */
export function ItemForm({
  clientId,
  files,
  item,
  save,
  onDone,
}: {
  clientId: string;
  files: RoomAcademyView['files'];
  item?: RoomAcademyItem;
  save: SaveItem;
  onDone: () => void;
}) {
  const t = useTranslations('academy');
  const id = useId();
  const field = (name: string) => `${id}-${name}`;
  const [kind, setKind] = useState<AcademyItemKind>(item?.kind ?? 'checklist');
  const [title, setTitle] = useState(item?.title ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [sourceKind, setSourceKind] = useState<'file' | 'link'>(item?.url ? 'link' : 'file');
  // A tutorial plays in the portal, so it offers only the library's videos.
  const choices = (forKind: AcademyItemKind) =>
    forKind === 'tutorial' ? files.filter((file) => file.kind === 'video') : files;
  const [fileId, setFileId] = useState(
    item?.file?.id ?? choices(item?.kind ?? 'checklist')[0]?.id ?? '',
  );
  const [url, setUrl] = useState(item?.url ?? '');
  const [steps, setSteps] = useState(item?.steps.map((step) => step.text).join('\n') ?? '');
  const [error, setError] = useState<AcademyError | null>(null);
  const [pending, startTransition] = useTransition();

  const source = (): ItemSource | null => {
    if (kind === 'checklist') return null;
    return sourceKind === 'link' ? { url: url.trim() } : { libraryFileId: fileId };
  };

  return (
    <form
      aria-label={item ? item.title : t('actions.newItem')}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await save({
            clientId,
            ...(item ? { itemId: item.id } : {}),
            kind,
            title: title.trim(),
            description: description.trim(),
            source: source(),
            steps: kind === 'checklist' ? linesOf(steps) : [],
          }).catch(() => ({ ok: false as const, code: 'not_found' }));
          if (result.ok) onDone();
          else setError(academyError(result.code));
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={field('kind')}>{t('form.kind')}</Label>
          <select
            id={field('kind')}
            value={kind}
            disabled={Boolean(item)}
            className={SELECT}
            onChange={(event) => {
              const next = event.target.value as AcademyItemKind;
              setKind(next);
              setFileId(choices(next)[0]?.id ?? '');
            }}
          >
            {KINDS.map((value) => (
              <option key={value} value={value}>
                {t(`kinds.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={field('title')}>{t('form.title')}</Label>
          <Input
            id={field('title')}
            value={title}
            maxLength={120}
            required
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={field('description')}>{t('form.description')}</Label>
        <Textarea
          id={field('description')}
          value={description}
          maxLength={1000}
          rows={2}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      {kind === 'checklist' ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={field('steps')}>{t('form.steps')}</Label>
          <Textarea
            id={field('steps')}
            value={steps}
            rows={5}
            onChange={(event) => setSteps(event.target.value)}
          />
        </div>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-body-sm font-medium text-text">{t('form.source')}</legend>
          <div className="flex flex-wrap gap-4 text-body-sm text-text">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={field('source')}
                checked={sourceKind === 'file'}
                onChange={() => setSourceKind('file')}
              />
              {t('form.file')}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={field('source')}
                checked={sourceKind === 'link'}
                onChange={() => setSourceKind('link')}
              />
              {t('form.link')}
            </label>
          </div>
          {sourceKind === 'file' ? (
            choices(kind).length === 0 ? (
              <p className="text-body-sm text-text-secondary">{t('form.noFiles')}</p>
            ) : (
              <div className="flex flex-col gap-1">
                <Label htmlFor={field('file')}>{t('form.fileChoice')}</Label>
                <select
                  id={field('file')}
                  value={fileId}
                  className={SELECT}
                  onChange={(event) => setFileId(event.target.value)}
                >
                  {choices(kind).map((file) => (
                    <option key={file.id} value={file.id}>
                      {t('form.fileOption', { folder: file.folderName, name: file.name })}
                    </option>
                  ))}
                </select>
              </div>
            )
          ) : (
            <div className="flex flex-col gap-1">
              <Label htmlFor={field('url')}>{t('form.url')}</Label>
              <Input
                id={field('url')}
                type="url"
                inputMode="url"
                placeholder="https://"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </div>
          )}
        </fieldset>
      )}
      {error ? <FormMessage tone="danger">{t(`errors.${error}`)}</FormMessage> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {t('form.save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {t('actions.cancel')}
        </Button>
      </div>
    </form>
  );
}
