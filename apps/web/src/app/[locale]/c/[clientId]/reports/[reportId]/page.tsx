import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { ReportEditor } from '@/components/client-reports/report-editor';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { loadRoomClientReport } from '@/modules/client-reports/server';
import { findVisibleClient } from '@/modules/organizations';
import { withUserContext } from '@/platform/db';
import { saveClientReportAction, shareClientReportAction } from '../../../../client-report-actions';
import { RoomHeader } from '../../room/room-header';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; clientId: string; reportId: string }> };

/** C-14 editor: one monthly report or QBR. */
export default async function RoomReportPage({ params }: PageProps) {
  const { locale: requested, clientId, reportId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const client = await withUserContext(session.claims, (tx) => findVisibleClient(tx, clientId));
  if (!client) notFound();
  const view = await loadRoomClientReport(session.claims, reportId);
  if (!view || view.clientId !== clientId) notFound();

  return (
    <div className="flex w-full flex-col gap-6">
      <RoomHeader
        clientId={clientId}
        clientName={client.name}
        projects={[]}
        selectedId={null}
        basePath={`/c/${clientId}/reports`}
      />
      <ReportEditor
        view={view}
        actions={{ save: saveClientReportAction, share: shareClientReportAction }}
      />
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'clientReports.title');
}
