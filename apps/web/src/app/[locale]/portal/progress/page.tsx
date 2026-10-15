import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { PortalRetainer } from '@/components/retainers/portal-retainer';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { loadClientRetainer } from '@/modules/retainers/server';
import { decideExtraAction, requestWorkAction } from '../../retainer-actions';
import { portalRoomAccess } from '../room-session';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

/** P-10: the retainer's month, the client's requests and the quotes to decide. */
export default async function PortalProgressPage({ params }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireArea('/portal', locale);
  const access = portalRoomAccess(session.ctx.clientRoles);
  const view =
    access.clientId && access.readsRoom
      ? await loadClientRetainer(session.claims, access.clientId)
      : null;
  const t = await getTranslations('retainers.portal');

  if (!view) {
    return <EmptyState title={t('title')} description={t('none')} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-title text-text">{t('title')}</h1>
        <p className="text-body-sm text-text-secondary">{t('description')}</p>
      </div>
      <PortalRetainer
        view={view}
        actions={{ request: requestWorkAction, decide: decideExtraAction }}
      />
    </div>
  );
}
