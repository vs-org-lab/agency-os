'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FormMessage } from '@/components/forms/form-message';
import { PasswordField } from '@/components/forms/password-field';
import { SubmitButton } from '@/components/forms/submit-button';
import { setPasswordAction, type SetPasswordState } from './actions';

const FIELD_ERRORS = {
  too_short: 'tooShort',
  pwned: 'pwned',
  check_unavailable: 'checkUnavailable',
} as const;

export function SetPasswordForm() {
  const t = useTranslations('auth');
  const [state, formAction] = useActionState<SetPasswordState, FormData>(setPasswordAction, {});
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.error) passwordRef.current?.focus();
  }, [state]);

  const fieldError =
    state.error && state.error in FIELD_ERRORS
      ? t(`setPassword.${FIELD_ERRORS[state.error as keyof typeof FIELD_ERRORS]}`)
      : undefined;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {state.error === 'update_failed' ? (
        <FormMessage tone="danger">{t('setPassword.checkUnavailable')}</FormMessage>
      ) : null}
      {state.error === 'session_expired' ? (
        <FormMessage tone="warning">{t('callback.error')}</FormMessage>
      ) : null}
      <PasswordField
        ref={passwordRef}
        name="password"
        label={t('setPassword.password')}
        autoComplete="new-password"
        minLength={12}
        required
        hint={t('setPassword.description')}
        showLabel={t('signIn.showPassword')}
        hideLabel={t('signIn.hidePassword')}
        error={fieldError}
      />
      <SubmitButton>{t('setPassword.submit')}</SubmitButton>
    </form>
  );
}
