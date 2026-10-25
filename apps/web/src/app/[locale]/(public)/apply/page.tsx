import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PublicFrame } from '@/components/public/public-frame';
import { requireLocale } from '@/i18n/require-locale';
import { loadPublicApplicationForm } from '@/modules/commercial/server';
import { submitApplicationAction } from './actions';
import { ApplicationForm } from './application-form';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ embed?: string }>;
};

export default async function ApplyPage({ params, searchParams }: PageProps) {
  setRequestLocale(requireLocale((await params).locale));
  const embed = (await searchParams).embed === '1';
  const t = await getTranslations('publicApply');
  const form = await loadPublicApplicationForm();

  return (
    <PublicFrame embed={embed}>
      <header className="flex flex-col gap-2">
        <h1 className="text-display text-text">{t('title')}</h1>
        <p className="text-body text-text-secondary">{t('intro')}</p>
      </header>
      <ApplicationForm
        definition={form.definition}
        version={form.version}
        embed={embed}
        action={submitApplicationAction}
      />
    </PublicFrame>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'publicApply.title');
}
