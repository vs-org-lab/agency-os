'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { ErrorState } from '@agency-os/ui/components/states/error-state';
import { Link } from '@/i18n/navigation';

/**
 * What a screen shows when it fails to load: the cause goes to Sentry, never to the reader, and
 * the reader can try again or go back to the start of their area. It renders inside the page's
 * main landmark, which the shell provides and the locale error boundary adds itself.
 */
export function RouteError({
  error,
  reset,
  home,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  home: string;
}) {
  const t = useTranslations('states');
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-4">
      <ErrorState
        className="w-full max-w-[480px]"
        title={t('error.title')}
        description={t('error.description')}
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button type="button" size="sm" onClick={reset}>
              {t('error.retry')}
            </Button>
            <Link href={home} className="text-body-sm text-link underline-offset-4 hover:underline">
              {t('notFound.home')}
            </Link>
          </div>
        }
      />
    </div>
  );
}
