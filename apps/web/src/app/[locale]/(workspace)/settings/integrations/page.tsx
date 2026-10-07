import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import { FormMessage } from '@/components/forms/form-message';
import { redirect } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { integrationsView, isFounder } from '@/modules/commercial/server';
import { getVerifiedClaims } from '@/platform/session';
import { connectGoogleAction, disconnectGoogleAction } from './actions';

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
  const google = view.google;
  const connected = google.status === 'active';

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-title text-text">{t('title')}</h1>
        <p className="text-body text-text-secondary">{t('description')}</p>
      </header>
      {result ? (
        <FormMessage tone={RESULT_TONE[result]}>{t(`result.${result}`)}</FormMessage>
      ) : null}

      <section
        aria-labelledby="google-calendar-title"
        className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 md:flex-row md:items-center md:justify-between"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 id="google-calendar-title" className="text-title-sm text-text">
              {t('google.title')}
            </h2>
            <Badge variant="secondary" className={connected ? 'bg-success-bg text-success' : ''}>
              {google.status === 'none'
                ? t('status.none')
                : t(`status.${google.status}`, { email: google.email })}
            </Badge>
          </div>
          <p className="text-body-sm text-text-secondary">{t('google.description')}</p>
          {view.provider === 'fake' ? (
            <p className="text-caption text-text-tertiary">{t('fakeProvider')}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          {connected ? (
            <form action={disconnectGoogleAction}>
              <Button type="submit" variant="outline">
                {t('disconnect')}
              </Button>
            </form>
          ) : (
            <form action={connectGoogleAction}>
              <Button type="submit" disabled={view.provider !== 'google'}>
                {google.status === 'none' ? t('connect') : t('reconnect')}
              </Button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
