import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { ApprovalDecision } from '@/components/rooms/approval-decision';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { loadPortalApprovals } from '@/modules/rooms/server';
import { portalRoomAccess } from '../room-session';
import { decideApprovalAction } from './actions';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

/** P-02: phases waiting for the client's decision; only the decision maker decides. */
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
      <ul className="flex flex-col gap-4">
        {pending.map((approval) => (
          <li
            key={approval.id}
            className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
          >
            <div className="flex flex-col gap-1">
              <h2 className="text-title-sm text-text">{approval.phaseName}</h2>
              <p className="text-body-sm text-text-secondary">{approval.projectName}</p>
            </div>
            {access.decides ? (
              <ApprovalDecision approvalId={approval.id} decide={decideApprovalAction} />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
