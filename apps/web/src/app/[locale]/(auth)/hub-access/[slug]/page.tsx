import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { restrictedHubAccess } from '@/modules/brand-hub/server';
import { getVerifiedClaims } from '@/platform/session';
import { AuthCard } from '../../auth-card';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ return?: string }>;
};

const LINK = 'text-body-sm text-link hover:underline';

/**
 * The restricted Brand Hub gate (RF-096, SEC-42): a signed-in member of the hub's client, or someone
 * who edits it, returns to the site with a token; anyone else is told why not.
 */
export default async function HubAccessPage({ params, searchParams }: PageProps) {
  const { locale: requested, slug } = await params;
  setRequestLocale(requireLocale(requested));
  const t = await getTranslations('brandHub.access');
  const returnTo = (await searchParams).return ?? '';
  const claims = await getVerifiedClaims();

  if (!claims) {
    return (
      <AuthCard title={t('signInTitle')} description={t('signInDescription')}>
        <div className="flex flex-col gap-2">
          <Link href="/sign-in" className={LINK}>
            {t('signIn')}
          </Link>
          <Link href="/magic-link" className={LINK}>
            {t('magicLink')}
          </Link>
        </div>
      </AuthCard>
    );
  }
  const result = await restrictedHubAccess(claims, slug, returnTo);
  if (result.ok) redirect(result.redirect);
  return (
    <AuthCard title={t('deniedTitle')} description={t('deniedDescription')}>
      <Link href="/" className={LINK}>
        {t('home')}
      </Link>
    </AuthCard>
  );
}
