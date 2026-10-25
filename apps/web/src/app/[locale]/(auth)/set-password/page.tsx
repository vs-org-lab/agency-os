import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { getVerifiedClaims } from '@/platform/session';
import { AuthCard } from '../auth-card';
import { SetPasswordForm } from './set-password-form';
import { pageMetadata } from '@/i18n/page-title';

type PageProps = { params: Promise<{ locale: string }> };

export default async function SetPasswordPage({ params }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  if (!(await getVerifiedClaims())) return redirect({ href: '/sign-in', locale });

  const t = await getTranslations('auth.setPassword');

  return (
    <AuthCard title={t('title')}>
      <SetPasswordForm />
    </AuthCard>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'auth.setPassword.title');
}
