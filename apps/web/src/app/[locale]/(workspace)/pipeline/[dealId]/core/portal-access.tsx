'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { FormMessage } from '@/components/forms/form-message';
import { grantPortalAccessAction } from './actions';

export function PortalAccess({ dealId, granted }: { dealId: string; granted: boolean }) {
  const t = useTranslations('diagnosis.access');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  return (
    <section
      aria-labelledby="core-access-title"
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 md:flex-row md:items-center md:justify-between"
    >
      <div className="flex flex-col gap-1">
        <h2 id="core-access-title" className="text-title-sm text-text">
          {t('title')}
        </h2>
        {granted ? <p className="text-body-sm text-success">{t('granted')}</p> : null}
        {feedback ? <FormMessage tone={feedback.tone}>{feedback.text}</FormMessage> : null}
      </div>
      {!granted ? (
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await grantPortalAccessAction(dealId);
              setFeedback(
                result.ok
                  ? { tone: 'success', text: t('sent') }
                  : { tone: 'danger', text: t(`errors.${result.code}` as never) },
              );
            })
          }
        >
          {t('grant')}
        </Button>
      ) : null}
    </section>
  );
}
