'use client';

import { RouteError } from '@/components/states/route-error';

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main" tabIndex={-1}>
      <RouteError error={error} reset={reset} home="/" />
    </main>
  );
}
