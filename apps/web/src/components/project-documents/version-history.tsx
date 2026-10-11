'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import type { DocumentVersionView } from '@/modules/project-documents';
import { versionFileHref } from './document-viewer';

/** RN-20: every version stays reachable; files download, links open. */
export function VersionHistory({
  versions,
  currentId,
}: {
  versions: DocumentVersionView[];
  currentId: string | null;
}) {
  const t = useTranslations('projectDocuments.versions');
  const format = useFormatter();
  return (
    <section aria-labelledby="document-versions-title" className="flex flex-col gap-3">
      <h2 id="document-versions-title" className="text-title-sm text-text">
        {t('title')}
      </h2>
      <ol className="flex flex-col gap-2">
        {versions.map((version) => {
          const label = t('item', {
            number: version.number,
            date: format.dateTime(new Date(version.createdAt), { dateStyle: 'medium' }),
          });
          const href =
            version.uploadStatus !== 'ready' ? null : (version.url ?? versionFileHref(version.id));
          return (
            <li key={version.id} className="flex flex-wrap items-center gap-2 text-body-sm">
              {href ? (
                <a
                  href={href}
                  className="text-link hover:underline"
                  {...(version.url ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {label}
                </a>
              ) : (
                <span className="text-text">{label}</span>
              )}
              {version.id === currentId ? <Badge variant="default">{t('current')}</Badge> : null}
              {version.shared ? <Badge variant="secondary">{t('shared')}</Badge> : null}
              {version.uploadStatus === 'uploading' ? (
                <Badge variant="outline">{t('uploading')}</Badge>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
