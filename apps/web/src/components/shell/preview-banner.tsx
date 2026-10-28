import { Eye } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@agency-os/i18n';
import { localizedPath } from './portal-preview-path';

/** Shown on every portal screen while the team previews it as the client. */
export function PreviewBanner({ clientName }: { clientName: string }) {
  const t = useTranslations('shell.clientPreview');
  const locale = useLocale() as Locale;

  return (
    <aside
      aria-label={t('label')}
      className="flex flex-wrap items-center justify-between gap-3 border-b border-info/40 bg-info-bg px-4 py-2.5 md:px-6 xl:px-8"
    >
      <p className="flex items-center gap-2 text-body-sm text-text">
        <Eye aria-hidden="true" className="size-4 shrink-0 text-info" />
        {t('notice', { client: clientName })}
      </p>
      {/* A full navigation: leaving the preview swaps the whole frame, not a page. */}
      <a
        href={localizedPath(locale, '/portal/preview-exit')}
        className="rounded-md border border-border-strong bg-surface px-3 py-1 text-body-sm font-medium text-text transition-colors duration-(--duration-fast) hover:bg-surface-muted"
      >
        {t('exit')}
      </a>
    </aside>
  );
}
