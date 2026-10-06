import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { requireLocale } from '@/i18n/require-locale';

type PageProps = { params: Promise<{ locale: string }> };

export default async function PortalHomePage({ params }: PageProps) {
  setRequestLocale(requireLocale((await params).locale));
  const t = await getTranslations('portal.home');

  return <EmptyState title={t('title')} description={t('description')} />;
}
