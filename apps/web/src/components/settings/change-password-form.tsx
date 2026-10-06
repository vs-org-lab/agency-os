'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { PasswordField } from '@/components/forms/password-field';
import { SubmitButton } from '@/components/forms/submit-button';
import { changePasswordAction, type ChangePasswordState } from './session-actions';

const ERROR_MESSAGES = {
  too_short: 'setPassword.tooShort',
  pwned: 'setPassword.pwned',
  check_unavailable: 'setPassword.checkUnavailable',
  update_failed: 'setPassword.checkUnavailable',
} as const;

export function ChangePasswordForm() {
  const t = useTranslations();
  const [state, formAction] = useActionState<ChangePasswordState, FormData>(
    changePasswordAction,
    {},
  );
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.error) passwordRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} noValidate className="flex max-w-[400px] flex-col gap-4">
      <PasswordField
        ref={passwordRef}
        name="password"
        label={t('auth.setPassword.password')}
        autoComplete="new-password"
        minLength={12}
        required
        hint={t('auth.setPassword.description')}
        showLabel={t('auth.signIn.showPassword')}
        hideLabel={t('auth.signIn.hidePassword')}
        error={state.error ? t(`auth.${ERROR_MESSAGES[state.error]}`) : undefined}
      />
      <SubmitButton>{t('sessions.changePasswordSubmit')}</SubmitButton>
    </form>
  );
}
