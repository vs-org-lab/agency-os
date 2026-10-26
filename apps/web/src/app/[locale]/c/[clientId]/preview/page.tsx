import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { ClientRoom } from '@/components/rooms/client-room';
import { FormMessage } from '@/components/forms/form-message';
import { requireArea } from '@/components/shell/session-guard';
import { Link } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { loadStaffPreview } from '@/modules/rooms/server';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; clientId: string }>;
  searchParams: Promise<{ project?: string }>;
};

/** "Ver como cliente" (RF-053, US-12): the room exactly as the client sees it, read only. */
export default async function RoomPreviewPage({ params, searchParams }: PageProps) {
  const { locale: requested, clientId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const { project: projectId } = await searchParams;
  const preview = await loadStaffPreview(session, { clientId, projectId });
  const t = await getTranslations('rooms');
  if (preview === null && projectId) notFound();

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FormMessage tone="info">{t('previewNotice')}</FormMessage>
        <Link
          href={`/c/${clientId}${projectId ? `?project=${projectId}` : ''}`}
          className="text-body-sm text-link hover:underline"
        >
          {t('backToRoom')}
        </Link>
      </div>
      {preview?.project ? (
        <ClientRoom project={preview.project} />
      ) : (
        <EmptyState title={t('noProject')} description={t('noProjectHint')} />
      )}
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'rooms.previewAsClient');
}
