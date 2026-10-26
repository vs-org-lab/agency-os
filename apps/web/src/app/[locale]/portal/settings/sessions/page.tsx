import { setRequestLocale } from 'next-intl/server';
import { SessionsSettings } from '@/components/settings/sessions-settings';
import { redirect } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { listSessions, sessionDeps } from '@/modules/identity';
import { getVerifiedClaims } from '@/platform/session';
import { pageMetadata } from '@/i18n/page-title';

type PageProps = { params: Promise<{ locale: string }> };

export default async function SessionsPage({ params }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);

  const claims = await getVerifiedClaims();
  if (!claims) return redirect({ href: '/sign-in', locale });

  return <SessionsSettings sessions={await listSessions(claims, sessionDeps())} />;
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'sessions.title');
}
