import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { UpdateFeed } from '@/components/rooms/update-feed';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { loadStaffRoom } from '@/modules/rooms/server';
import { publishUpdateAction } from '../actions';
import { RoomHeader } from '../room/room-header';
import { UpdateComposer } from '../room/update-composer';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; clientId: string }>;
  searchParams: Promise<{ project?: string }>;
};

export default async function RoomUpdatesPage({ params, searchParams }: PageProps) {
  const { locale: requested, clientId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const { project: projectId } = await searchParams;
  const data = await loadStaffRoom(session, { clientId, projectId });
  if (!data) notFound();
  const { room, editable } = data;
  const t = await getTranslations('rooms');

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-6">
      <RoomHeader
        clientId={clientId}
        clientName={room.clientName}
        projects={room.projects}
        selectedId={room.project?.id ?? null}
        basePath={`/c/${clientId}/updates`}
      />
      {room.project ? (
        <>
          {editable ? (
            <UpdateComposer projectId={room.project.id} publish={publishUpdateAction} />
          ) : null}
          <section aria-labelledby="room-updates-title" className="flex flex-col gap-3">
            <h2 id="room-updates-title" className="text-title-sm text-text">
              {t('updates.title')}
            </h2>
            <UpdateFeed updates={room.project.updates} />
          </section>
        </>
      ) : (
        <EmptyState title={t('noProject')} description={t('noProjectHint')} />
      )}
    </div>
  );
}
