'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { revokeSessionAction, type RevokeSessionState } from './session-actions';

export function RevokeSessionButton({ sessionId }: { sessionId: string }) {
  const t = useTranslations('sessions');
  const [state, formAction, pending] = useActionState<RevokeSessionState, FormData>(
    revokeSessionAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="sessionId" value={sessionId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending} aria-busy={pending}>
        {t('revoke')}
      </Button>
      {state.error ? (
        <p role="alert" className="text-caption text-danger">
          {t('revokeFailed')}
        </p>
      ) : null}
    </form>
  );
}
