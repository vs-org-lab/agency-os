import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RoomAcademy } from '@/components/academy/room-academy';
import { offersClientPreview } from '@/components/shell/portal-preview-path';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { loadClientRoomAcademy } from '@/modules/academy/server';
import { findVisibleClient } from '@/modules/organizations';
import { withUserContext } from '@/platform/db';
import {
  checkAcademyStepAction,
  deleteAcademyItemAction,
  deleteTrainingSessionAction,
  moveAcademyItemAction,
  saveAcademyItemAction,
  saveTrainingSessionAction,
  setAcademyItemStatusAction,
} from '../../../academy-actions';
import { RoomHeader } from '../room/room-header';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; clientId: string }> };

/** C-12: the client's academy and training sessions (RF-140, RF-141). */
export default async function RoomAcademyPage({ params }: PageProps) {
  const { locale: requested, clientId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const client = await withUserContext(session.claims, (tx) => findVisibleClient(tx, clientId));
  if (!client) notFound();
  const view = await loadClientRoomAcademy(session.claims, clientId);
  if (!view) notFound();

  const t = await getTranslations('academy');

  return (
    <div className="flex w-full flex-col gap-6">
      <RoomHeader
        title={t('title')}
        client={{ id: clientId, name: client.name }}
        projects={[]}
        selectedId={null}
        showPreviewLink={offersClientPreview(session.actor)}
        basePath={`/c/${clientId}/academy`}
      />
      <RoomAcademy
        clientId={clientId}
        view={view}
        actions={{
          saveItem: saveAcademyItemAction,
          setStatus: setAcademyItemStatusAction,
          deleteItem: deleteAcademyItemAction,
          moveItem: moveAcademyItemAction,
          checkStep: checkAcademyStepAction,
          saveSession: saveTrainingSessionAction,
          deleteSession: deleteTrainingSessionAction,
        }}
      />
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'academy.title');
}
