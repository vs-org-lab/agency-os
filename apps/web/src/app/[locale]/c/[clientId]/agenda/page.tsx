import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AgendaCalendar } from '@/components/agenda/agenda-calendar';
import { agendaPeriod } from '@/components/agenda/agenda-period';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { lisbonDay } from '@/modules/agenda';
import { loadAgendaRange } from '@/modules/agenda/server';
import { findVisibleClient } from '@/modules/organizations';
import { withUserContext } from '@/platform/db';
import {
  cancelMeetingAction,
  scheduleMeetingAction,
  updateMeetingAction,
} from '../../../agenda-actions';
import { RoomHeader } from '../room/room-header';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; clientId: string }>;
  searchParams: Promise<{ view?: string; date?: string }>;
};

/** The room's Agenda: the client's meetings, deadlines and deliveries (RF-100). */
export default async function RoomAgendaPage({ params, searchParams }: PageProps) {
  const { locale: requested, clientId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const client = await withUserContext(session.claims, (tx) => findVisibleClient(tx, clientId));
  if (!client) notFound();
  const today = lisbonDay(new Date());
  const period = agendaPeriod(await searchParams, today);
  const agenda = await loadAgendaRange(session.claims, {
    from: period.from,
    to: period.to,
    clientId,
  });
  if (!agenda) notFound();
  const t = await getTranslations('agenda');
  const basePath = `/c/${clientId}/agenda`;

  return (
    <div className="flex w-full flex-col gap-6">
      <RoomHeader
        clientId={clientId}
        clientName={client.name}
        projects={[]}
        selectedId={null}
        basePath={basePath}
      />
      <h2 className="text-title-sm text-text">{t('roomTitle')}</h2>
      <AgendaCalendar
        view={period.view}
        date={period.date}
        today={today}
        basePath={basePath}
        items={agenda.items}
        busy={[]}
        canSchedule={agenda.canSchedule}
        clients={agenda.clients}
        projects={agenda.projects}
        fixedClientId={clientId}
        actions={{
          schedule: scheduleMeetingAction,
          update: updateMeetingAction,
          cancel: cancelMeetingAction,
        }}
      />
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'agenda.roomTitle');
}
