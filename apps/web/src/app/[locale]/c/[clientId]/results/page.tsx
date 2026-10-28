import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ResultsTable } from '@/components/results/results-table';
import { offersClientPreview } from '@/components/shell/portal-preview-path';
import { requireArea } from '@/components/shell/session-guard';
import { pageMetadata } from '@/i18n/page-title';
import { requireLocale } from '@/i18n/require-locale';
import { findVisibleClient } from '@/modules/organizations';
import { loadRoomResults } from '@/modules/results/server';
import { withUserContext } from '@/platform/db';
import { archiveKpiAction, recordKpiValuesAction, saveKpiAction } from '../../../results-actions';
import { RoomHeader } from '../room/room-header';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; clientId: string }> };

/** Sala › Resultados (RD-3): the client's indicators by month, entered or imported. */
export default async function RoomResultsPage({ params }: PageProps) {
  const { locale: requested, clientId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const [client, view] = await Promise.all([
    withUserContext(session.claims, (tx) => findVisibleClient(tx, clientId)),
    loadRoomResults(session.claims, clientId),
  ]);
  if (!client || !view) notFound();

  const t = await getTranslations('results');

  return (
    <div className="flex w-full flex-col gap-6">
      <RoomHeader
        title={t('title')}
        description={t('description')}
        client={{ id: clientId, name: client.name }}
        projects={[]}
        selectedId={null}
        showPreviewLink={offersClientPreview(session.actor)}
        basePath={`/c/${clientId}/results`}
      />
      <ResultsTable
        clientId={clientId}
        view={view}
        actions={{
          saveKpi: saveKpiAction,
          archiveKpi: archiveKpiAction,
          recordValues: recordKpiValuesAction,
        }}
      />
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'results.title');
}
