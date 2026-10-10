'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import { MAX_UPDATE_ATTACHMENTS, type AttachableFile } from '@/modules/library';

/** RF-055: picks up to ten library files of the project to attach to an update. */
export function AttachmentPicker({
  files,
  selected,
  onChange,
  visibility,
}: {
  files: readonly AttachableFile[];
  selected: readonly string[];
  onChange: (fileIds: string[]) => void;
  visibility: 'internal' | 'client';
}) {
  const t = useTranslations('library.attachments');
  const tv = useTranslations('library.visibility');
  const id = useId();
  const [filter, setFilter] = useState('');
  const full = selected.length >= MAX_UPDATE_ATTACHMENTS;
  const needle = filter.trim().toLowerCase();
  const shown = needle ? files.filter((file) => file.name.toLowerCase().includes(needle)) : files;
  const hiddenSelected =
    visibility === 'client' &&
    files.some((file) => file.visibility === 'internal' && selected.includes(file.id));

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-label text-text">{t('choose')}</legend>
      {files.length === 0 ? (
        <p className="text-body-sm text-text-secondary">{t('none')}</p>
      ) : (
        <>
          <div className="flex flex-col gap-1 md:w-80">
            <Label htmlFor={`${id}-filter`}>{t('filter')}</Label>
            <Input
              id={`${id}-filter`}
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </div>
          <p className="text-caption text-text-secondary" aria-live="polite">
            {t('selected', { count: selected.length })} {t('limit')}
          </p>
          <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
            {shown.map((file) => {
              const checked = selected.includes(file.id);
              return (
                <li key={file.id}>
                  <label className="flex items-center gap-2 text-body-sm text-text">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={checked}
                      disabled={!checked && full}
                      onChange={() =>
                        onChange(
                          checked
                            ? selected.filter((fileId) => fileId !== file.id)
                            : [...selected, file.id],
                        )
                      }
                    />
                    <span className="truncate">{file.name}</span>
                    <span className="text-caption text-text-secondary">{file.folderName}</span>
                    {file.visibility === 'internal' ? (
                      <Badge variant="outline">{tv('internal')}</Badge>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
          {hiddenSelected ? <FormMessage tone="danger">{t('internalWarning')}</FormMessage> : null}
        </>
      )}
    </fieldset>
  );
}
