import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireLocale } from '@/i18n/require-locale';
import { AuthCard } from '../auth-card';
import { AcceptInvitationForm } from './accept-invitation-form';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token_hash?: string; type?: string }>;
};

export default async function AcceptInvitationPage({ params, searchParams }: PageProps) {
  setRequestLocale(requireLocale((await params).locale));
  const t = await getTranslations('auth.invitation');
  const { token_hash: tokenHash, type } = await searchParams;

  return (
    <AuthCard title={t('title')} description={t('description')}>
      <AcceptInvitationForm tokenHash={type === 'invite' && tokenHash ? tokenHash : ''} />
    </AuthCard>
  );
}
