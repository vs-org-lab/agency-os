import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { ClientRoom } from '@/components/rooms/client-room';
import { requireArea } from '@/components/shell/session-guard';
import { Link } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { loadPortalRoom } from '@/modules/rooms/server';
import { decideApprovalAction } from '../approvals/actions';
import { portalRoomAccess } from '../room-session';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ project?: string }>;
};

/** P-05: the project process and feed as the client sees them. */
export default async function PortalUpdatesPage({ params, searchParams }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireArea('/portal', locale);
  const access = portalRoomAccess(session.ctx.clientRoles);
  const { project: projectId } = await searchParams;
  const room =
    access.clientId && access.readsRoom
      ? await loadPortalRoom(session.claims, access.clientId, projectId)
      : null;
  const t = await getTranslations('portal.room');

  if (!room?.project) {
    return <EmptyState title={t('updatesTitle')} description={t('noPhase')} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-6">
      <h1 className="text-title text-text">{t('updatesTitle')}</h1>
      {room.projects.length > 1 ? (
        <nav aria-label={t('projectSelector')}>
          <ul className="flex flex-wrap gap-2">
            {room.projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/portal/updates?project=${project.id}`}
                  aria-current={project.id === room.project?.id ? 'page' : undefined}
                  className="inline-flex rounded-md border border-border px-3 py-1 text-body-sm text-text aria-[current=page]:border-text aria-[current=page]:bg-surface-muted"
                >
                  {project.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <ClientRoom
        project={room.project}
        {...(access.decides ? { decide: decideApprovalAction } : {})}
      />
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'portal.room.updatesTitle');
}
