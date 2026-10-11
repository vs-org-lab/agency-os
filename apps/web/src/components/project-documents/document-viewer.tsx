'use client';

import { useState } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FigmaFrame } from '@/components/documents/figma-frame';
import { PdfCanvas } from '@/components/proofing/pdf-canvas';
import { FIGMA_EMBED_HOST, toFigmaEmbedUrl } from '@/modules/documents';
import type { DocumentVersionView } from '@/modules/project-documents';

const ACTION =
  'inline-flex items-center gap-2 self-start rounded-md border border-border px-3 py-2 text-body-sm text-text hover:border-text';

export function versionFileHref(versionId: string): string {
  return `/api/documents/versions/${versionId}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** C-05 and P-03: a version shown by its kind (RF-031, RF-032). */
export function DocumentViewer({
  title,
  version,
}: {
  title: string;
  version: DocumentVersionView | null;
}) {
  const t = useTranslations('projectDocuments.viewer');
  const [page, setPage] = useState(1);
  if (!version) return <p className="text-body-sm text-text-secondary">{t('noVersion')}</p>;
  if (version.uploadStatus !== 'ready') {
    return <p className="text-body-sm text-text-secondary">{t('uploading')}</p>;
  }

  if (version.kind === 'figma' && version.url) {
    const embedUrl = toFigmaEmbedUrl(version.url, FIGMA_EMBED_HOST);
    return (
      <div className="flex flex-col gap-3">
        {embedUrl ? <FigmaFrame embedUrl={embedUrl} title={title} /> : null}
        <a href={version.url} target="_blank" rel="noopener noreferrer" className={ACTION}>
          <ExternalLink aria-hidden="true" className="size-4" />
          {t('openFigma')}
        </a>
      </div>
    );
  }

  if (version.kind === 'link' && version.url) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-muted p-6">
        <a href={version.url} target="_blank" rel="noopener noreferrer" className={ACTION}>
          <ExternalLink aria-hidden="true" className="size-4" />
          {t('openLink', { host: hostOf(version.url) })}
        </a>
        <p className="text-caption text-text-secondary">{t('linkHint')}</p>
      </div>
    );
  }

  const name = version.fileName ?? title;
  const download = (
    <a href={versionFileHref(version.id)} className={ACTION}>
      <Download aria-hidden="true" className="size-4" />
      {t('download', { name })}
    </a>
  );
  if (version.kind === 'pdf' && version.pages) {
    return (
      <div className="flex flex-col gap-3">
        <PdfCanvas
          src={versionFileHref(version.id)}
          pages={version.pages}
          page={page}
          onPageChange={setPage}
          pins={[]}
          pending={null}
          activeId={null}
          canPin={false}
          onPick={() => undefined}
          onSelect={() => undefined}
        />
        {download}
      </div>
    );
  }
  return <div className="rounded-lg border border-border bg-surface-muted p-6">{download}</div>;
}
