import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { RoomDocumentCards } from '@/components/project-documents/document-cards';
import { NewRoomDocument } from '@/components/project-documents/room-document-controls';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { findVisibleClient } from '@/modules/organizations';
import { loadClientRoomDocuments } from '@/modules/project-documents/server';
import { withUserContext } from '@/platform/db';
import { finishDocumentUploadAction, startDocumentAction } from '../../../document-actions';
import { RoomHeader } from '../room/room-header';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; clientId: string }>;
  searchParams: Promise<{ project?: string }>;
};

/** C-04: the documents of the project, with the Core presentations and the commercial states. */
export default async function RoomDocumentsPage({ params, searchParams }: PageProps) {
  const { locale: requested, clientId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const client = await withUserContext(session.claims, (tx) => findVisibleClient(tx, clientId));
  if (!client) notFound();
  const { project } = await searchParams;
  const view = await loadClientRoomDocuments(session.claims, clientId, project);
  const t = await getTranslations('projectDocuments');
  const basePath = `/c/${clientId}/docs`;

  return (
    <div className="flex w-full flex-col gap-6">
      <RoomHeader
        title={t('title')}
        client={{ id: clientId, name: client.name }}
        projects={view?.projects ?? []}
        selectedId={view?.projectId ?? null}
        showPreviewLink={Boolean(view?.projectId)}
        basePath={basePath}
        actions={
          view?.projectId && view.canWrite ? (
            <NewRoomDocument
              projectId={view.projectId}
              basePath={basePath}
              actions={{
                startDocument: startDocumentAction,
                finishUpload: finishDocumentUploadAction,
              }}
            />
          ) : null
        }
      />
      {view?.projectId ? (
        <RoomDocumentCards clientId={clientId} view={view} />
      ) : (
        <EmptyState title={t('noProject')} description="" />
      )}
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'projectDocuments.title');
}
