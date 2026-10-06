import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { requireLocale } from '@/i18n/require-locale';

type PageProps = { params: Promise<{ locale: string; clientId: string }> };

export default async function RoomHomePage({ params }: PageProps) {
  setRequestLocale(requireLocale((await params).locale));
  const t = await getTranslations('room.home');

  return <EmptyState title={t('title')} description={t('description')} />;
}
