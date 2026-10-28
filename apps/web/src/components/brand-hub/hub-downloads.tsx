'use client';

import { useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { FormMessage } from '@/components/forms/form-message';
import { saveZip } from '@/components/library/zip-archive';
import type { ZipManifest } from '@/modules/library';
import { hubError, type HubError } from './hub-errors';

export type RequestHubZip = (
  pageId: string | null,
) => Promise<ZipManifest | { ok: false; code: string }>;

/** The hub keeps its own colours inside the OS theme, so its buttons read on either surface. */
const HUB_BUTTON =
  'border-[var(--hub-divider)] bg-[var(--hub-surface)] text-[var(--hub-text)] hover:bg-[var(--hub-panel)] hover:text-[var(--hub-text)] dark:border-[var(--hub-divider)] dark:bg-[var(--hub-surface)] dark:hover:bg-[var(--hub-panel)]';

/**
 * RF-093: one page's files, or every asset of the publication, built into a ZIP in the browser
 * from links that expire (SEC-32).
 */
export function HubDownloads({
  pageId,
  label,
  requestZip,
}: {
  pageId: string | null;
  label: string;
  requestZip: RequestHubZip;
}) {
  const t = useTranslations('brandHub');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<HubError | null>(null);

  const download = async () => {
    setPending(true);
    setError(null);
    try {
      const manifest = await requestZip(pageId).catch(
        () => ({ ok: false, code: 'not_found' }) as const,
      );
      if (!manifest.ok) {
        setError(hubError(manifest.code));
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={download}
        className={HUB_BUTTON}
      >
        <Download aria-hidden="true" />
        {pending
          ? t('downloads.preparing')
          : pageId === null
            ? t('downloads.all')
            : t('downloads.page', { page: label })}
      </Button>
      {error ? <FormMessage tone="danger">{t(`errors.${error}`)}</FormMessage> : null}
    </div>
  );
}

export type RequestHubManual = () => Promise<
  { ok: true; url: string; fileName: string } | { ok: false; code: string }
>;

/** RF-093: the full brand manual of the publication, as a PDF link that expires (SEC-32). */
export function HubManualDownload({
  requestManual,
  open = (url) => window.location.assign(url),
}: {
  requestManual: RequestHubManual;
  open?: (url: string) => void;
}) {
  const t = useTranslations('brandHub');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<HubError | null>(null);

  const download = async () => {
    setPending(true);
    setError(null);
    const result = await requestManual().catch(() => ({ ok: false, code: 'not_found' }) as const);
    setPending(false);
    if (result.ok) open(result.url);
    else setError(hubError(result.code));
  };

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={download}
        className={HUB_BUTTON}
      >
        <FileText aria-hidden="true" />
        {pending ? t('downloads.preparingManual') : t('downloads.manual')}
      </Button>
      {error ? <FormMessage tone="danger">{t(`errors.${error}`)}</FormMessage> : null}
    </div>
  );
}
