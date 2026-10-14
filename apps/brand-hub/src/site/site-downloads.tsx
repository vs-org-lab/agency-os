'use client';

import { useState } from 'react';
import { downloadZip } from 'client-zip';
import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import type { ZipManifest } from './api';

async function* entries(manifest: ZipManifest) {
  for (const entry of manifest.entries) {
    const response = await fetch(entry.url);
    if (!response.ok) throw new Error(`Hub file could not be fetched: ${response.status}`);
    yield { name: entry.path, input: response };
  }
}

async function saveZip(manifest: ZipManifest): Promise<void> {
  const blob = await downloadZip(entries(manifest)).blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = manifest.archiveName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** A page's files, or every asset, as a ZIP built in the browser from links that expire. */
export function SiteDownloads({
  label,
  requestZip,
}: {
  label: string | null;
  requestZip: () => Promise<ZipManifest | null>;
}) {
  const t = useTranslations('brandHub');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const download = async () => {
    setPending(true);
    setFailed(false);
    try {
      const manifest = await requestZip();
      if (!manifest) setFailed(true);
      else await saveZip(manifest);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={download}>
        <Download aria-hidden="true" />
        {pending
          ? t('downloads.preparing')
          : label === null
            ? t('downloads.all')
            : t('downloads.page', { page: label })}
      </Button>
      {failed ? (
        <p role="alert" className="text-caption text-danger">
          {t('errors.download_failed')}
        </p>
      ) : null}
    </div>
  );
}
