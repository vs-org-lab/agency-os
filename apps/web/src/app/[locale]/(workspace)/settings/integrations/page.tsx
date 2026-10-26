import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@agency-os/ui/components/page-header';
import { FormMessage } from '@/components/forms/form-message';
import { redirect } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { integrationsView, isFounder } from '@/modules/commercial/server';
import { IntegrationsScreen } from '@/components/settings/integrations/integrations-screen';
import { getVerifiedClaims } from '@/platform/session';
import { studioServices } from '@/platform/studio-services';
import { connectGoogleAction, disconnectGoogleAction } from './actions';
import { pageMetadata } from '@/i18n/page-title';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ result?: string }>;
};

const RESULT_TONE = { connected: 'success', disconnected: 'info', error: 'danger' } as const;

export default async function IntegrationsPage({ params, searchParams }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  const claims = await getVerifiedClaims();
  if (!claims) return redirect({ href: '/sign-in', locale });
  if (!(await isFounder(claims))) notFound();

  const t = await getTranslations('settings.integrations');
  const view = await integrationsView(claims);
  const requested = (await searchParams).result;
  const result =
    requested && requested in RESULT_TONE ? (requested as keyof typeof RESULT_TONE) : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      {result ? (
        <FormMessage tone={RESULT_TONE[result]}>{t(`result.${result}`)}</FormMessage>
      ) : null}
      <IntegrationsScreen
        google={view.google}
        provider={view.provider}
        services={studioServices()}
        connectAction={connectGoogleAction}
        disconnectAction={disconnectGoogleAction}
      />
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'settings.integrations.title');
}
