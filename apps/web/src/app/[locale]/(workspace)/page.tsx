import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Button } from '@agency-os/ui/components/button';
import { Link } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { loadUpcomingEvents } from '@/modules/agenda/server';
import { loadStudioHome } from '@/modules/studio/server';
import { getVerifiedClaims } from '@/platform/session';
import { ClientProgress } from './home/client-progress';
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
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-title text-text">{t('title')}</h1>
          <p className="text-body text-text-secondary">
            {t('date', { date: format.dateTime(now, { dateStyle: 'full' }) })}
          </p>
        </div>
        <nav aria-label={t('actions.label')} className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/tasks?new=1">{t('actions.newTask')}</Link>
          </Button>
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

      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="home-today" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="home-today" className="text-heading text-text">
              {today('title')}
            </h2>
            <p className="text-body-sm text-text-secondary">{today('description')}</p>
          </div>
          <TodayList items={home.today} />
        </section>

        <div className="flex flex-col gap-8">
          <section aria-labelledby="home-upcoming" className="flex flex-col gap-3">
            <h2 id="home-upcoming" className="text-heading text-text">
              {t('upcoming.title')}
            </h2>
            <UpcomingEvents items={upcoming} />
          </section>

          <section aria-labelledby="home-clients" className="flex flex-col gap-3">
            <h2 id="home-clients" className="text-heading text-text">
              {t('clients.title')}
            </h2>
            <ClientProgress clients={home.clients} />
          </section>
        </div>
      </div>
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'studio.home.title');
}
