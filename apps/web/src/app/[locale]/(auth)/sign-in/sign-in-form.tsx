'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FormMessage } from '@/components/forms/form-message';
import { PasswordField } from '@/components/forms/password-field';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { Link } from '@/i18n/navigation';
import { signInAction, type SignInState } from './actions';

export function SignInForm({ inactive }: { inactive: boolean }) {
  const t = useTranslations('auth.signIn');
  const [state, formAction] = useActionState<SignInState, FormData>(signInAction, { email: '' });
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.error === 'email_invalid' || state.error === 'invalid_credentials') {
      emailRef.current?.focus();
    } else if (state.error === 'password_required') {
      passwordRef.current?.focus();
    }
  }, [state]);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {inactive && !state.error ? <FormMessage tone="info">{t('inactive')}</FormMessage> : null}
      {state.error === 'invalid_credentials' ? (
        <FormMessage tone="danger">{t('invalidCredentials')}</FormMessage>
      ) : null}
      <TextField
        ref={emailRef}
        name="email"
        type="email"
        label={t('email')}
        autoComplete="username"
        inputMode="email"
        required
        defaultValue={state.email}
        error={state.error === 'email_invalid' ? t('emailInvalid') : undefined}
      />
      <PasswordField
        ref={passwordRef}
        name="password"
        label={t('password')}
        autoComplete="current-password"
        required
        showLabel={t('showPassword')}
        hideLabel={t('hidePassword')}
        error={state.error === 'password_required' ? t('passwordRequired') : undefined}
      />
      <SubmitButton>{t('submit')}</SubmitButton>
      <Link
        href="/magic-link"
        className="text-center text-body-sm text-link underline-offset-4 hover:underline"
      >
        {t('magicLinkPrompt')}
      </Link>
    </form>
  );
}
