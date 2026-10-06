'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FormMessage } from '@/components/forms/form-message';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { Link } from '@/i18n/navigation';
import { magicLinkAction, type MagicLinkState } from './actions';

export function MagicLinkForm({ linkFailed }: { linkFailed: boolean }) {
  const t = useTranslations('auth');
  const [state, formAction] = useActionState<MagicLinkState, FormData>(magicLinkAction, {
    email: '',
    status: 'idle',
  });
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.status === 'email_invalid') emailRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {linkFailed && state.status === 'idle' ? (
        <FormMessage tone="warning">{t('callback.error')}</FormMessage>
      ) : null}
      {state.status === 'sent' ? (
        <FormMessage tone="success">{t('magicLink.sent')}</FormMessage>
      ) : null}
      <TextField
        ref={emailRef}
        name="email"
        type="email"
        label={t('magicLink.email')}
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.email}
        error={state.status === 'email_invalid' ? t('signIn.emailInvalid') : undefined}
      />
      <SubmitButton>{t('magicLink.submit')}</SubmitButton>
      <Link
        href="/sign-in"
        className="text-center text-body-sm text-link underline-offset-4 hover:underline"
      >
        {t('magicLink.backToSignIn')}
      </Link>
    </form>
  );
}
