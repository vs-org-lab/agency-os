'use client';

import { useState } from 'react';
import { downloadZip } from 'client-zip';
import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { FormMessage } from '@/components/forms/form-message';
import type { ZipManifest } from '@/modules/library';
import { libraryError, type LibraryError } from './library-errors';

export type RequestZip = (
  projectId: string,
  folderId: string | null,
) => Promise<ZipManifest | { ok: false; code: string }>;

async function* zipEntries(entries: ZipManifest['entries']) {
  for (const entry of entries) {
    const response = await fetch(entry.url);
    if (!response.ok) throw new Error(`Library file could not be fetched: ${response.status}`);
    yield { name: entry.path, input: response };
  }
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * RF-081, US-16: asks the server for the files the viewer may read and builds the ZIP in the
 * browser, fetching one file at a time.
 */
export function ZipDownload({
  projectId,
  folderId,
  requestZip,
}: {
  projectId: string;
  folderId: string | null;
  requestZip: RequestZip;
}) {
  const t = useTranslations('library');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<LibraryError | null>(null);

  const download = async () => {
    setPending(true);
    setError(null);
    try {
      const manifest = await requestZip(projectId, folderId).catch(
        () => ({ ok: false, code: 'not_found' }) as const,
      );
      if (!manifest.ok) {
        setError(libraryError(manifest.code));
        return;
      }
      saveBlob(await downloadZip(zipEntries(manifest.entries)).blob(), manifest.archiveName);
    } catch {
      setError('download_failed');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={download}>
        <Download aria-hidden="true" />
        {pending ? t('preparingZip') : folderId ? t('downloadFolder') : t('downloadAll')}
      </Button>
      {error ? <FormMessage tone="danger">{t(`errors.${error}`)}</FormMessage> : null}
    </div>
  );
}
