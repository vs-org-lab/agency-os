import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { LibraryBrowser } from '@/components/library/library-browser';
import { parseLibraryParams } from '@/components/library/library-params';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { loadStaffLibrary } from '@/modules/library/server';
import { findVisibleClient } from '@/modules/organizations';
import { withUserContext } from '@/platform/db';
import {
  createFolderAction,
  deleteFileAction,
  deleteFolderAction,
  finishUploadAction,
  renameFolderAction,
  setFolderVisibilityAction,
  startUploadsAction,
  zipAction,
} from '../../../library-actions';
import { RoomHeader } from '../room/room-header';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** C-06: the project library for the team. */
export default async function RoomLibraryPage({ params, searchParams }: PageProps) {
  const { locale: requested, clientId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const client = await withUserContext(session.claims, (tx) => findVisibleClient(tx, clientId));
  if (!client) notFound();
  const { params: libraryParams, query } = parseLibraryParams(await searchParams);
  const view = await loadStaffLibrary(session.claims, clientId, query);
  const t = await getTranslations('library');
  const basePath = `/c/${clientId}/library`;

  return (
    <div className="flex w-full flex-col gap-6">
      <RoomHeader
        clientId={clientId}
        clientName={client.name}
        projects={view?.projects ?? []}
        selectedId={view?.projectId ?? null}
        basePath={basePath}
      />
      <h2 className="text-title-sm text-text">{t('title')}</h2>
      {view?.projectId ? (
        <LibraryBrowser
          view={view}
          basePath={basePath}
          params={{ ...libraryParams, project: view.projectId }}
          audience="staff"
          actions={{
            createFolder: createFolderAction,
            renameFolder: renameFolderAction,
            setVisibility: setFolderVisibilityAction,
            deleteFolder: deleteFolderAction,
            startUploads: startUploadsAction,
            finishUpload: finishUploadAction,
            deleteFile: deleteFileAction,
            zip: zipAction,
          }}
        />
      ) : (
        <EmptyState title={t('noProject')} description="" />
      )}
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'library.title');
}
