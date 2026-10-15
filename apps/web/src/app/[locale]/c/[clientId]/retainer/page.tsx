import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { RetainerScreen } from '@/components/retainers/retainer-screen';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { findVisibleClient } from '@/modules/organizations';
import { loadRoomRetainer } from '@/modules/retainers/server';
import { withUserContext } from '@/platform/db';
import {
  deleteUsageAction,
  quoteExtraAction,
  recordUsageAction,
  saveRetainerAction,
} from '../../../retainer-actions';
import { RoomHeader } from '../room/room-header';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; clientId: string }> };

/** C-10: the client's retainer, its month and extra requests. */
export default async function RoomRetainerPage({ params }: PageProps) {
  const { locale: requested, clientId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const client = await withUserContext(session.claims, (tx) => findVisibleClient(tx, clientId));
  if (!client) notFound();
  const view = await loadRoomRetainer(session.claims, clientId);
  if (!view || (!view.retainer && !view.canWrite)) notFound();

  return (
    <div className="flex w-full flex-col gap-6">
      <RoomHeader
        clientId={clientId}
        clientName={client.name}
        projects={[]}
        selectedId={null}
        basePath={`/c/${clientId}/retainer`}
      />
      <RetainerScreen
        clientId={clientId}
        view={view}
        actions={{
          saveRetainer: saveRetainerAction,
          recordUsage: recordUsageAction,
          deleteUsage: deleteUsageAction,
          quoteExtra: quoteExtraAction,
        }}
      />
    </div>
  );
}
