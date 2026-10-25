'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import en from '@agency-os/i18n/messages/en';
import ptPT from '@agency-os/i18n/messages/pt-PT';
import '@agency-os/ui/styles/globals.css';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-PT">
      <body className="flex min-h-dvh items-center justify-center bg-canvas px-4">
        <main role="alert" className="flex max-w-[480px] flex-col gap-2 text-center">
          <h1 className="text-title text-text">{ptPT.states.error.title}</h1>
          <p className="text-body text-text-secondary">{ptPT.states.error.description}</p>
          <p lang="en" className="text-caption text-text-tertiary">
            {en.states.error.title}
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-2 self-center rounded-md border border-border px-3 py-1.5 text-body-sm text-text"
          >
            {ptPT.states.error.retry}
            <span lang="en" className="text-text-tertiary">
              {` · ${en.states.error.retry}`}
            </span>
          </button>
        </main>
      </body>
    </html>
  );
}
