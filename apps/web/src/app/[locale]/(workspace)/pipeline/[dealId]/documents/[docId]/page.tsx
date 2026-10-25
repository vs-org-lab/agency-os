import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { z } from 'zod';
import { Badge } from '@agency-os/ui/components/badge';
import { FigmaFrame } from '@/components/documents/figma-frame';
import { Link } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { commercialSession } from '@/modules/commercial/server';
import { loadCoreWorkspace } from '@/modules/diagnosis/server';
import { FIGMA_EMBED_HOST, toFigmaEmbedUrl } from '@/modules/documents';
import { getVerifiedClaims } from '@/platform/session';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; dealId: string; docId: string }> };

export default async function StudioDocumentPage({ params }: PageProps) {
  const { locale: requested, dealId, docId } = await params;
  setRequestLocale(requireLocale(requested));
  if (!z.uuid().safeParse(dealId).success || !z.uuid().safeParse(docId).success) notFound();
  const session = await commercialSession(await getVerifiedClaims());
  if (!session) notFound();
  const core = await loadCoreWorkspace(session, dealId);
  const document = core?.documents.find((entry) => entry.id === docId);
  const embedUrl = document ? toFigmaEmbedUrl(document.url, FIGMA_EMBED_HOST) : null;
  if (!document || !embedUrl) notFound();

  const t = await getTranslations('diagnosis.presentation');
  return (
    <div className="flex flex-col gap-4">
      <Link href={`/pipeline/${dealId}`} className="text-body-sm text-link hover:underline">
        {t('back')}
      </Link>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-title text-text">{document.title}</h1>
          <Badge
            className={
              document.status === 'with_client'
                ? 'bg-info-bg text-info'
                : 'bg-surface-muted text-text-secondary'
            }
          >
            {t(`status.${document.status}`)}
          </Badge>
        </div>
        <a
          href={document.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-body-sm text-link hover:underline"
        >
          {t('openInFigma')}
        </a>
      </header>
      <FigmaFrame embedUrl={embedUrl} title={document.title} />
      <p className="text-caption text-text-tertiary">{t('publicHint')}</p>
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'diagnosis.presentation.title');
}
