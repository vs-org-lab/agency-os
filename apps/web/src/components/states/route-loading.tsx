import { useTranslations } from 'next-intl';
import { Skeleton } from '@agency-os/ui/components/skeleton';

/** Skeleton shown by a segment's `loading.tsx` while its server data streams in. */
export function RouteLoading() {
  const t = useTranslations('states.loading');

  return (
    <div role="status" aria-busy="true" className="mx-auto flex w-full max-w-180 flex-col gap-6">
      <span className="sr-only">{t('title')}</span>
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-7 w-1/3 motion-reduce:animate-none" />
        <Skeleton className="h-4 w-2/3 motion-reduce:animate-none" />
      </div>
      <div className="flex flex-col gap-3" aria-hidden="true">
        <Skeleton className="h-24 w-full motion-reduce:animate-none" />
        <Skeleton className="h-24 w-full motion-reduce:animate-none" />
      </div>
    </div>
  );
}
