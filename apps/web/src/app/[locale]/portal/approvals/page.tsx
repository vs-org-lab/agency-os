import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { ApprovalsList } from '@/components/proofing/approvals-list';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { loadPortalApprovals } from '@/modules/rooms/server';
import { portalRoomAccess } from '../room-session';
import { decideApprovalAction } from './actions';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

/** P-02: phases and files waiting for the client, grouped; only the decision maker decides. */
export default async function PortalApprovalsPage({ params }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireArea('/portal', locale);
  const access = portalRoomAccess(session.ctx.clientRoles);
  const pending =
    access.clientId && access.readsRoom
      ? await loadPortalApprovals(session.claims, access.clientId)
      : [];
  const t = await getTranslations('portal.room');

  if (pending.length === 0) {
    return <EmptyState title={t('approvalsTitle')} description={t('approvalsEmpty')} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-6">
      <h1 className="text-title text-text">{t('approvalsTitle')}</h1>
      <ApprovalsList approvals={pending} decides={access.decides} decide={decideApprovalAction} />
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'portal.room.approvalsTitle');
}
