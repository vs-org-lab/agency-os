'use client';

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { cn } from '@agency-os/ui/lib/utils';
import { FormMessage } from '@/components/forms/form-message';
import { useRouter } from '@/i18n/navigation';
import type { ClientOnboardingView } from '@/modules/client-onboarding';

type Locale = 'pt-PT' | 'en';

/** The room's view of the client's onboarding: what was answered, by whom, and asking again. */
export function OnboardingProgress({
  view,
  reopen,
}: {
  view: ClientOnboardingView;
  reopen: ((requestId: string) => Promise<{ ok: true } | { ok: false; code: string }>) | null;
}) {
  const t = useTranslations('clientOnboarding');
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const done = view.items.filter((item) => item.done).length;
  const hasUploads = view.items.some((item) => item.request.kind === 'upload' && item.done);

  return (
    <section
      aria-labelledby="room-onboarding"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="room-onboarding" className="text-body-sm font-semibold text-text">
          {t('room.title')}
        </h2>
        <span className="text-caption text-text-secondary">
          {t('room.progress', { done, total: view.items.length })}
        </span>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {view.items.map((item) => (
          <li key={item.request.id} className="flex flex-col gap-1 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 items-start gap-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full',
                    item.done ? 'bg-success-bg text-success' : 'border border-border-strong',
                  )}
                >
                  {item.done ? <Check className="size-3" /> : null}
                </span>
                <span className="text-body-sm text-text">{item.request.title[locale]}</span>
              </span>
              {item.done && reopen ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await reopen(item.request.id);
                      if (result.ok) {
                        setMessage(t('room.reopened'));
                        router.refresh();
                      }
                    })
                  }
                >
                  {t('room.reopen')}
                </Button>
              ) : null}
            </div>
            <p className="pl-6 text-caption text-text-tertiary">
              {item.done && item.completedAt
                ? [
                    format.dateTime(new Date(item.completedAt), { dateStyle: 'medium' }),
                    item.respondedByName,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : t('room.open')}
            </p>
            {item.done && item.response ? (
              <p className="pl-6 text-body-sm whitespace-pre-line text-text-secondary">
                {item.response}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {hasUploads ? <p className="text-caption text-text-tertiary">{t('room.folder')}</p> : null}
      {message ? <FormMessage tone="success">{message}</FormMessage> : null}
    </section>
  );
}
