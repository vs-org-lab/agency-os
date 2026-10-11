'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { FormMessage } from '@/components/forms/form-message';
import type { ZipManifest } from '@/modules/library';
import { libraryError, type LibraryError } from './library-errors';
import { saveZip } from './zip-archive';

export type RequestZip = (
  projectId: string,
  folderId: string | null,
) => Promise<ZipManifest | { ok: false; code: string }>;

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
      await saveZip(manifest);
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
