import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { getVerifiedClaims } from '@/platform/session';
import { createSupabaseServerClient } from '@/platform/supabase-server';
import { AuthCard } from '../../auth-card';
import { safeNextPath } from '../safe-next-path';
import { TotpForm } from '../totp-form';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; reason?: string }>;
};

export default async function VerifyTotpPage({ params, searchParams }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  const { next, reason } = await searchParams;

  const claims = await getVerifiedClaims();
  if (!claims) return redirect({ href: '/sign-in', locale });

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const factor = data?.totp.find((candidate) => candidate.status === 'verified');
  if (!factor) return redirect({ href: '/mfa/enroll', locale });

  const t = await getTranslations('auth.mfa');

  return (
    <AuthCard title={t('verifyTitle')} description={t('verifyDescription')}>
      <TotpForm
        factorId={factor.id}
        mode="verify"
        next={safeNextPath(next)}
        notice={reason === 'reauthenticate' ? t('reauthenticationRequired') : undefined}
      />
    </AuthCard>
  );
}
