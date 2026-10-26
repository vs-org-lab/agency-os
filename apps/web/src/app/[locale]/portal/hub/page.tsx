import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@agency-os/ui/components/badge';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { PortalHub } from '@/components/brand-hub/portal-hub';
import { ApprovalDecision } from '@/components/rooms/approval-decision';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { loadPortalBrandHub } from '@/modules/brand-hub/server';
import { decideHubApprovalAction, hubManualAction, hubZipAction } from '../../brand-hub-actions';
import { portalRoomAccess } from '../room-session';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';
/** The brand manual is generated on its first download (RF-093). */
export const maxDuration = 60;

type PageProps = { params: Promise<{ locale: string }> };

/** P-08: the published brand hub, with downloads and, when asked, the decision. */
export default async function PortalBrandHubPage({ params }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireArea('/portal', locale);
  const access = portalRoomAccess(session.ctx.clientRoles);
  const clientId = access.clientId;
  const hub =
    clientId && access.readsRoom ? await loadPortalBrandHub(session.claims, clientId) : null;
  const t = await getTranslations('brandHub');

  if (!clientId || !hub) {
    return <EmptyState title={t('portalEmpty.title')} description={t('portalEmpty.description')} />;
  }
  const requestZip = async (pageId: string | null) => {
    'use server';
    return hubZipAction(clientId, pageId);
  };
  const requestManual = async () => {
    'use server';
    return hubManualAction(clientId);
  };

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-title text-text">{t('title')}</h1>
        {hub.approved ? <Badge>{t('portal.approved')}</Badge> : null}
      </header>
      {hub.pendingApprovalId ? (
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <p className="text-body-sm text-text">{t('portal.decideHint')}</p>
          <ApprovalDecision approvalId={hub.pendingApprovalId} decide={decideHubApprovalAction} />
        </section>
      ) : null}
      <PortalHub hub={hub} requestZip={requestZip} requestManual={requestManual} />
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'brandHub.title');
}
