import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { PortalOutcome } from '@/components/outcomes/portal-outcome';
import { PortalRetainer } from '@/components/retainers/portal-retainer';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { loadClientOutcome } from '@/modules/outcomes/server';
import { loadClientRetainer } from '@/modules/retainers/server';
import { decideExtraAction, requestWorkAction } from '../../retainer-actions';
import { portalRoomAccess } from '../room-session';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

/** P-10: the agreed outcome and the retainer's month, whichever the client has. */
export default async function PortalProgressPage({ params }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireArea('/portal', locale);
  const access = portalRoomAccess(session.ctx.clientRoles);
  const [outcome, retainer] =
    access.clientId && access.readsRoom
      ? await Promise.all([
          loadClientOutcome(session.claims, access.clientId),
          loadClientRetainer(session.claims, access.clientId),
        ])
      : [null, null];
  const t = await getTranslations('retainers.portal');
  const tOutcomes = await getTranslations('outcomes.portal');

  if (!outcome && !retainer) {
    return <EmptyState title={t('title')} description={tOutcomes('empty')} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-10">
      <h1 className="text-title text-text">{t('title')}</h1>
      {outcome ? <PortalOutcome view={outcome} /> : null}
      {retainer ? (
        <div className="flex flex-col gap-6">
          <p className="text-body-sm text-text-secondary">{t('description')}</p>
          <PortalRetainer
            view={retainer}
            actions={{ request: requestWorkAction, decide: decideExtraAction }}
          />
        </div>
      ) : null}
    </div>
  );
}
