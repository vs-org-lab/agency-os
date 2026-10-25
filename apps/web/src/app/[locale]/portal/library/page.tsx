import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { LibraryBrowser } from '@/components/library/library-browser';
import { libraryHref } from '@/components/library/library-href';
import { parseLibraryParams } from '@/components/library/library-params';
import { requireArea } from '@/components/shell/session-guard';
import { Link } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { loadPortalLibrary } from '@/modules/library/server';
import {
  createFolderAction,
  deleteFileAction,
  finishUploadAction,
  startUploadsAction,
  zipAction,
} from '../../library-actions';
import { portalRoomAccess } from '../room-session';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const BASE_PATH = '/portal/library';

/** P-04: the folders shared with the client, with downloads and, for operational users, uploads. */
export default async function PortalLibraryPage({ params, searchParams }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireArea('/portal', locale);
  const access = portalRoomAccess(session.ctx.clientRoles);
  const { params: libraryParams, query } = parseLibraryParams(await searchParams);
  const view =
    access.clientId && access.readsRoom
      ? await loadPortalLibrary(session.claims, access.clientId, query)
      : null;
  const t = await getTranslations('library');
  const tr = await getTranslations('portal.room');

  if (!view?.projectId) {
    return <EmptyState title={t('title')} description={t('emptyPortal')} />;
  }
  const current = { ...libraryParams, project: view.projectId };

  return (
    <div className="flex w-full flex-col gap-6">
      <h1 className="text-title text-text">{t('title')}</h1>
      {view.projects.length > 1 ? (
        <nav aria-label={tr('projectSelector')}>
          <ul className="flex flex-wrap gap-2">
            {view.projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={libraryHref(BASE_PATH, { project: project.id })}
                  aria-current={project.id === view.projectId ? 'page' : undefined}
                  className="inline-flex rounded-md border border-border px-3 py-1 text-body-sm text-text aria-[current=page]:border-text aria-[current=page]:bg-surface-muted"
                >
                  {project.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <LibraryBrowser
        view={view}
        basePath={BASE_PATH}
        params={current}
        audience="portal"
        actions={{
          createFolder: createFolderAction,
          startUploads: startUploadsAction,
          finishUpload: finishUploadAction,
          deleteFile: deleteFileAction,
          zip: zipAction,
        }}
      />
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'library.title');
}
