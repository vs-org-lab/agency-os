import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { loadStudioUpdates } from '@/modules/studio/server';
import { getVerifiedClaims } from '@/platform/session';
import { StudioFeed } from './studio-feed';
import { pageMetadata } from '@/i18n/page-title';

type PageProps = { params: Promise<{ locale: string }> };

export default async function StudioUpdatesPage({ params }: PageProps) {
  setRequestLocale(requireLocale((await params).locale));
  const entries = await loadStudioUpdates(await getVerifiedClaims(), new Date());
  if (entries === null) notFound();
  const t = await getTranslations('studio.feed');

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-title text-text">{t('title')}</h1>
        <p className="text-body text-text-secondary">{t('description')}</p>
      </header>
      <StudioFeed entries={entries} />
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'studio.feed.title');
}
