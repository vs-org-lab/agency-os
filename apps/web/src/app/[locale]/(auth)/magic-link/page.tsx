import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireLocale } from '@/i18n/require-locale';
import { AuthCard } from '../auth-card';
import { MagicLinkForm } from './magic-link-form';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function MagicLinkPage({ params, searchParams }: PageProps) {
  setRequestLocale(requireLocale((await params).locale));
  const t = await getTranslations('auth.magicLink');
  const { error } = await searchParams;

  return (
    <AuthCard title={t('title')} description={t('description')}>
      <MagicLinkForm linkFailed={error === 'link'} />
    </AuthCard>
  );
}
