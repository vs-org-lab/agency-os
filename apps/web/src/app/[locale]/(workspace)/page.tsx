import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Button } from '@agency-os/ui/components/button';
import { Link } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { loadUpcomingEvents } from '@/modules/agenda/server';
import { loadStudioHome } from '@/modules/studio/server';
import { getVerifiedClaims } from '@/platform/session';
import { ClientProgress } from './home/client-progress';
import { HomeCreateMenu } from './home/create-menu';
import { HomePanel } from './home/home-panel';
import { HomeIndicators } from './home/indicators';
import { TodayList } from './home/today-list';
import { UpcomingEvents } from './home/upcoming-events';
import { pageMetadata } from '@/i18n/page-title';

type PageProps = { params: Promise<{ locale: string }> };

export default async function StudioHomePage({ params }: PageProps) {
  setRequestLocale(requireLocale((await params).locale));
  const now = new Date();
  const claims = await getVerifiedClaims();
  const home = await loadStudioHome(claims, now);
  if (home === null || !claims) notFound();
  const upcoming = await loadUpcomingEvents(claims);

  const t = await getTranslations('studio.home');
  const today = await getTranslations('studio.today');
  const format = await getFormatter();

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-2">
        <div className="flex flex-col gap-1.5">
          <p className="text-caption font-medium text-text-tertiary first-letter:uppercase">
            {t('date', { date: format.dateTime(now, { dateStyle: 'full' }) })}
          </p>
          <h1 className="text-display tracking-[-0.025em] text-text">
            {home.readerFirstName ? t('greeting', { name: home.readerFirstName }) : t('title')}
          </h1>
        </div>
        <nav aria-label={t('actions.label')} className="flex flex-wrap gap-2">
          <HomeCreateMenu create={home.create} />
          {home.pipeline ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/pipeline">{t('actions.pipeline')}</Link>
            </Button>
          ) : null}
          <Button asChild size="sm" variant="outline">
            <Link href="/updates">{t('actions.updates')}</Link>
          </Button>
        </nav>
      </header>

      <HomeIndicators indicators={home.indicators} />

      <div className="grid gap-4 lg:grid-cols-2">
        <HomePanel
          id="home-today"
          title={today('title')}
          action={{ href: '/tasks', label: t('openToday') }}
          style={{ animationDelay: '40ms' }}
        >
          <TodayList items={home.today} />
        </HomePanel>
        <UpcomingEvents items={upcoming} today={home.localDate} />
      </div>

      <section aria-labelledby="home-clients" className="flex flex-col gap-2.5 pt-3">
        <h2 id="home-clients" className="text-body-sm font-semibold text-text">
          {t('clients.title')}{' '}
          <span className="font-medium text-text-tertiary tabular-nums">{home.clients.length}</span>
        </h2>
        <ClientProgress clients={home.clients} />
      </section>
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'studio.home.title');
}
