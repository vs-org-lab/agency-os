import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { Link } from '@/i18n/navigation';

export default async function NotFound() {
  const t = await getTranslations('states.notFound');

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <EmptyState
        className="w-full max-w-[480px]"
        title={t('title')}
        description={t('description')}
        action={
          <Link href="/" className="text-body-sm text-link underline-offset-4 hover:underline">
            {t('home')}
          </Link>
        }
      />
    </main>
  );
}
