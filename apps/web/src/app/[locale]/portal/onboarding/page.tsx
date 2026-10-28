import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { OnboardingList } from '@/components/client-onboarding/onboarding-list';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { pageMetadata } from '@/i18n/page-title';
import { loadOnboarding } from '@/modules/client-onboarding/server';
import { finishUploadAction, startUploadsAction } from '../../library-actions';
import { onboardingFolderAction, respondOnboardingAction } from '../../onboarding-actions';
import { portalRoomAccess } from '../room-session';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

/** The client's onboarding requests, worked out from the briefing and the contracted scope. */
export default async function PortalOnboardingPage({ params }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireArea('/portal', locale);
  const access = portalRoomAccess(session.ctx.clientRoles);
  const view =
    access.clientId && access.readsRoom
      ? await loadOnboarding(session.claims, access.clientId)
      : null;
  const t = await getTranslations('clientOnboarding.portal');

  if (!access.clientId || !view) {
    return <EmptyState title={t('title')} description={t('empty')} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-200 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-title text-text">{t('title')}</h1>
        <p className="max-w-[64ch] text-body-sm text-text-secondary">{t('description')}</p>
      </header>
      <OnboardingList
        view={view}
        actions={{
          respond: respondOnboardingAction.bind(null, access.clientId),
          folder: onboardingFolderAction.bind(null, access.clientId),
          startUploads: startUploadsAction,
          finishUpload: finishUploadAction,
        }}
      />
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'clientOnboarding.portal.title');
}
