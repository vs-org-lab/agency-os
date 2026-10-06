import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { enrollTotp } from '@/modules/identity';
import { getVerifiedClaims } from '@/platform/session';
import { createSupabaseServerClient } from '@/platform/supabase-server';
import { AuthCard } from '../../auth-card';
import { TotpForm } from '../totp-form';

type PageProps = { params: Promise<{ locale: string }> };

export default async function EnrollTotpPage({ params }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);

  const claims = await getVerifiedClaims();
  if (!claims) return redirect({ href: '/sign-in', locale });
  if (claims.aal === 'aal2') return redirect({ href: '/', locale });

  const t = await getTranslations('auth.mfa');
  const supabase = await createSupabaseServerClient();
  const enrollment = await enrollTotp({ auth: supabase.auth });

  return (
    <AuthCard title={t('enrollTitle')} description={t('enrollDescription')}>
      <div className="mb-6 flex flex-col items-center gap-4">
        <img
          src={enrollment.qrCode}
          alt={t('qrAlt')}
          width={176}
          height={176}
          className="rounded-md border border-border bg-white p-2"
        />
        <div className="flex w-full flex-col gap-1">
          <span className="text-caption text-text-tertiary">{t('secretLabel')}</span>
          <code className="rounded-md bg-surface-muted px-3 py-2 font-mono text-code break-all text-text select-all">
            {enrollment.secret}
          </code>
        </div>
      </div>
      <TotpForm factorId={enrollment.factorId} mode="enroll" />
    </AuthCard>
  );
}
