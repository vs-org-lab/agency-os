import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AgendaCalendar } from '@/components/agenda/agenda-calendar';
import { agendaPeriod } from '@/components/agenda/agenda-period';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { lisbonDay } from '@/modules/agenda';
import { loadAgendaRange, loadHostBusy } from '@/modules/agenda/server';
import {
  cancelMeetingAction,
  scheduleMeetingAction,
  updateMeetingAction,
} from '../../agenda-actions';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string; date?: string; new?: string }>;
};

/** S-04: everything dated across the clients the reader sees, one colour per client. */
export default async function StudioCalendarPage({ params, searchParams }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const today = lisbonDay(new Date());
  const query = await searchParams;
  const period = agendaPeriod(query, today);
  const [agenda, busy] = await Promise.all([
    loadAgendaRange(session.claims, { from: period.from, to: period.to }),
    period.view === 'week' ? loadHostBusy(session.claims, period.from, period.to) : [],
  ]);
  if (!agenda) notFound();
  const t = await getTranslations('agenda');

  return (
    <div className="flex w-full flex-col gap-6">
      <h1 className="text-title text-text">{t('title')}</h1>
      <AgendaCalendar
        view={period.view}
        date={period.date}
        today={today}
        basePath="/calendar"
        items={agenda.items}
        busy={busy}
        canSchedule={agenda.canSchedule || agenda.clients.length > 0}
        openNewRequested={query.new === '1'}
        clients={agenda.clients}
        projects={agenda.projects}
        fixedClientId={null}
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
  return pageMetadata(params, 'agenda.title');
}
