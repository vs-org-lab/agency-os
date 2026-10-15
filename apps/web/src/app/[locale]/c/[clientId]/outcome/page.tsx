import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { OutcomeScreen } from '@/components/outcomes/outcome-screen';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { findVisibleClient } from '@/modules/organizations';
import { loadRoomOutcome } from '@/modules/outcomes/server';
import { withUserContext } from '@/platform/db';
import {
  addConditionAction,
  recordConditionAction,
  recordMeasurementAction,
  saveOutcomeAction,
} from '../../../outcome-actions';
import { RoomHeader } from '../room/room-header';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; clientId: string }> };

/** C-11: the client's agreed outcome, its progress, the client conditions and the guarantee. */
export default async function RoomOutcomePage({ params }: PageProps) {
  const { locale: requested, clientId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const client = await withUserContext(session.claims, (tx) => findVisibleClient(tx, clientId));
  if (!client) notFound();
  const view = await loadRoomOutcome(session.claims, clientId);
  if (!view || (!view.outcome && !view.canWrite)) notFound();

  return (
    <div className="flex w-full flex-col gap-6">
      <RoomHeader
        clientId={clientId}
        clientName={client.name}
        projects={[]}
        selectedId={null}
        basePath={`/c/${clientId}/outcome`}
      />
      <OutcomeScreen
        clientId={clientId}
        view={view}
        actions={{
          save: saveOutcomeAction,
          addCondition: addConditionAction,
          recordCondition: recordConditionAction,
          recordMeasurement: recordMeasurementAction,
        }}
      />
    </div>
  );
}
