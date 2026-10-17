'use client';

import { RouteError } from '@/components/states/route-error';

/** Inside the portal the shell stays, and "back to the start" means the portal's home. */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError error={error} reset={reset} home="/portal" />;
}
