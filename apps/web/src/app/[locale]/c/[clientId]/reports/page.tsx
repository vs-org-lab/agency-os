import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { ReportsList } from '@/components/client-reports/reports-list';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { loadRoomClientReports } from '@/modules/client-reports/server';
import { findVisibleClient } from '@/modules/organizations';
import { withUserContext } from '@/platform/db';
import { createClientReportAction } from '../../../client-report-actions';
import { RoomHeader } from '../room/room-header';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; clientId: string }> };

/** C-14: the client's monthly reports and QBRs (RF-130). */
export default async function RoomReportsPage({ params }: PageProps) {
  const { locale: requested, clientId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const client = await withUserContext(session.claims, (tx) => findVisibleClient(tx, clientId));
  if (!client) notFound();
  const view = await loadRoomClientReports(session.claims, clientId);
  if (!view) notFound();

  return (
    <div className="flex w-full flex-col gap-6">
      <RoomHeader
        clientId={clientId}
        clientName={client.name}
        projects={[]}
        selectedId={null}
        basePath={`/c/${clientId}/reports`}
      />
      <ReportsList clientId={clientId} view={view} create={createClientReportAction} />
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'clientReports.title');
}
