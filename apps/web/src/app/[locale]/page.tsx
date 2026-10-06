import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BrandSymbol } from '@agency-os/ui/brand';
import { requireLocale } from '@/i18n/require-locale';

type PageProps = { params: Promise<{ locale: string }> };

export default async function HomePage({ params }: PageProps) {
  setRequestLocale(requireLocale((await params).locale));
  const t = await getTranslations('app');

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas text-text">
      <BrandSymbol className="size-12" title={t('name')} />
    </main>
  );
}
