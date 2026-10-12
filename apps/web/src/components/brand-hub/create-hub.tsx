'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { FormMessage } from '@/components/forms/form-message';
import { useRouter } from '@/i18n/navigation';
import { hubError, type ActionResult, type HubError } from './hub-errors';

/** F6 step 1: creates the hub with the nine standard pages. */
export function CreateHub({
  clientId,
  create,
}: {
  clientId: string;
  create: (clientId: string) => Promise<ActionResult>;
}) {
  const t = useTranslations('brandHub');
  const router = useRouter();
  const [error, setError] = useState<HubError | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const outcome = await create(clientId).catch(
              () => ({ ok: false, code: 'not_found' }) as const,
            );
            setError(outcome.ok ? null : hubError(outcome.code));
            if (outcome.ok) router.refresh();
          })
        }
      >
        {t('empty.create')}
      </Button>
      {error ? <FormMessage tone="danger">{t(`errors.${error}`)}</FormMessage> : null}
    </div>
  );
}
