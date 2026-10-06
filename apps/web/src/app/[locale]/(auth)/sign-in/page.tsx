import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireLocale } from '@/i18n/require-locale';
import { AuthCard } from '../auth-card';
import { SignInForm } from './sign-in-form';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reason?: string }>;
};

export default async function SignInPage({ params, searchParams }: PageProps) {
  setRequestLocale(requireLocale((await params).locale));
  const t = await getTranslations('auth.signIn');
  const { reason } = await searchParams;

  return (
    <AuthCard title={t('title')} description={t('description')}>
      <SignInForm inactive={reason === 'inactive'} />
    </AuthCard>
  );
}
