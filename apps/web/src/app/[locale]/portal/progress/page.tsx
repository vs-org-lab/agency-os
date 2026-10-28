import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { PortalOutcome } from '@/components/outcomes/portal-outcome';
import { ProgressSummary } from '@/components/portal/progress-summary';
import { PortalRetainer } from '@/components/retainers/portal-retainer';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { loadClientOutcome } from '@/modules/outcomes/server';
import { loadClientRetainer } from '@/modules/retainers/server';
import { decideExtraAction, requestWorkAction } from '../../retainer-actions';
import { portalRoomAccess } from '../room-session';
import { pageMetadata } from '@/i18n/page-title';

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
  const tProgress = await getTranslations('portal.progress');

  if (!outcome && !retainer) {
    return <EmptyState title={t('title')} description={tOutcomes('empty')} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-240 flex-col gap-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-title text-text">{t('title')}</h1>
        <p className="max-w-[64ch] text-body-sm text-text-secondary">{tProgress('description')}</p>
      </header>
      <ProgressSummary outcome={outcome} retainer={retainer} />
      {outcome ? (
        <section aria-labelledby="progress-outcome-detail" className="flex flex-col gap-4">
          <h2 id="progress-outcome-detail" className="text-title-sm text-text">
            {tOutcomes('title')}
          </h2>
          <PortalOutcome view={outcome} />
        </section>
      ) : null}
      {retainer ? (
        <section aria-labelledby="progress-retainer-detail" className="flex flex-col gap-4">
          <h2 id="progress-retainer-detail" className="text-title-sm text-text">
            {tProgress('retainerTitle')}
          </h2>
          <p className="text-body-sm text-text-secondary">{t('description')}</p>
          <PortalRetainer
            view={retainer}
            actions={{ request: requestWorkAction, decide: decideExtraAction }}
          />
        </section>
      ) : null}
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'retainers.portal.title');
}
