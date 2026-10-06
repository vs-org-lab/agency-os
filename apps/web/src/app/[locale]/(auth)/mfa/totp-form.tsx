'use client';

import { useActionState, useEffect, useId, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@agency-os/ui/components/input-otp';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import { SubmitButton } from '@/components/forms/submit-button';
import { verifyTotpAction, type VerifyTotpState } from './actions';

const SLOTS = [0, 1, 2, 3, 4, 5];

export function TotpForm({
  factorId,
  mode,
  next,
  notice,
}: {
  factorId: string;
  mode: 'enroll' | 'verify';
  next?: string;
  notice?: string;
}) {
  const t = useTranslations('auth.mfa');
  const [state, formAction] = useActionState<VerifyTotpState, FormData>(verifyTotpAction, {});
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    if (state.error) inputRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {notice && !state.error ? <FormMessage tone="info">{notice}</FormMessage> : null}
      <input type="hidden" name="factorId" value={factorId} />
      <input type="hidden" name="mode" value={mode} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={id} className="text-label text-text">
          {t('code')}
        </Label>
        <InputOTP
          ref={inputRef}
          id={id}
          name="code"
          maxLength={6}
          pattern={REGEXP_ONLY_DIGITS}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          aria-invalid={state.error ? true : undefined}
          aria-describedby={`${id}-hint${state.error ? ` ${id}-error` : ''}`}
        >
          <InputOTPGroup>
            {SLOTS.map((index) => (
              <InputOTPSlot key={index} index={index} className="size-11 text-title-sm" />
            ))}
          </InputOTPGroup>
        </InputOTP>
        <p id={`${id}-hint`} className="text-caption text-text-tertiary">
          {t('codeHint')}
        </p>
        {state.error ? (
          <p id={`${id}-error`} role="alert" className="text-caption text-danger">
            {t('invalidCode')}
          </p>
        ) : null}
      </div>
      <SubmitButton>{t('submit')}</SubmitButton>
    </form>
  );
}
