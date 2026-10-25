'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FormMessage } from '@/components/forms/form-message';
import { Link } from '@/i18n/navigation';
import { SubmitButton } from '@/components/forms/submit-button';
import { acceptInvitationAction, type AcceptInvitationState } from './actions';
import { parseInvitationFragment, type InvitationTokens } from './invitation-fragment';

export function AcceptInvitationForm({ tokenHash }: { tokenHash: string }) {
  const t = useTranslations('auth.invitation');
  const [state, formAction] = useActionState<AcceptInvitationState, FormData>(
    acceptInvitationAction,
    {},
  );
  const [tokens, setTokens] = useState<InvitationTokens | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const parsed = parseInvitationFragment(window.location.hash);
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    setTokens(parsed);
    setReady(true);
  }, []);

  if (!ready) return null;
  if (state.error || (!tokenHash && !tokens)) {
    return (
      <div className="flex flex-col items-center gap-3">
        <FormMessage tone="warning">{t('invalid')}</FormMessage>
        <Link href="/sign-in" className="text-body-sm text-link underline-offset-4 hover:underline">
          {t('signIn')}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {tokenHash ? <input type="hidden" name="token_hash" value={tokenHash} /> : null}
      {tokens ? (
        <>
          <input type="hidden" name="access_token" value={tokens.accessToken} />
          <input type="hidden" name="refresh_token" value={tokens.refreshToken} />
        </>
      ) : null}
      <SubmitButton>{t('accept')}</SubmitButton>
    </form>
  );
}
