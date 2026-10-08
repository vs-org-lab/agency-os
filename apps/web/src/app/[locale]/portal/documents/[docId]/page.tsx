import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { z } from 'zod';
import { FigmaFrame } from '@/components/documents/figma-frame';
import { requireArea } from '@/components/shell/session-guard';
import { Link } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { loadPortalDocument } from '@/modules/documents/server';

type PageProps = { params: Promise<{ locale: string; docId: string }> };

export default async function PortalDocumentPage({ params }: PageProps) {
  const { locale: requested, docId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  if (!z.uuid().safeParse(docId).success) notFound();
  const session = await requireArea('/portal', locale);
  const document = await loadPortalDocument(session, docId);
  if (!document) notFound();
  const t = await getTranslations('portal.core');

  return (
    <div className="flex flex-col gap-4">
      <Link href="/portal" className="text-body-sm text-link hover:underline">
        {t('back')}
      </Link>
      <h1 className="text-title text-text">{document.title}</h1>
      <FigmaFrame embedUrl={document.embedUrl} title={document.title} />
    </div>
  );
}
