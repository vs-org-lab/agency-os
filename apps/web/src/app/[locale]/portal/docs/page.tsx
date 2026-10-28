import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { PortalDocumentCards } from '@/components/project-documents/document-cards';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { loadClientPortalDocuments } from '@/modules/project-documents/server';
import { portalRoomAccess } from '../room-session';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

/** The documents shared with the client, across the client's projects. */
export default async function PortalDocumentsPage({ params }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireArea('/portal', locale);
  const access = portalRoomAccess(session.ctx.clientRoles);
  const documents =
    access.clientId && access.readsRoom
      ? await loadClientPortalDocuments(session.claims, access.clientId)
      : [];
  const t = await getTranslations('projectDocuments.portal');

  if (documents.length === 0) {
    return <EmptyState title={t('title')} description={t('empty')} />;
  }
  return (
    <div className="mx-auto flex w-full max-w-240 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-title text-text">{t('title')}</h1>
        <p className="max-w-[64ch] text-body-sm text-text-secondary">{t('description')}</p>
      </header>
      <PortalDocumentCards documents={documents} />
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'projectDocuments.portal.title');
}
