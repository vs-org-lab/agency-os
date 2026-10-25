'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { FormMessage } from '@/components/forms/form-message';

export type CancelBookingState = { status: 'idle' | 'error' };

/** Cancelling the call asks first, and a cancel that fails says so instead of doing nothing. */
export function CancelBooking({
  action,
}: {
  action: (state: CancelBookingState) => Promise<CancelBookingState>;
}) {
  const t = useTranslations('publicApply.booking.manage');
  const [state, formAction, pending] = useActionState<CancelBookingState>(action, {
    status: 'idle',
  });
  const [confirming, setConfirming] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const toggled = useRef(false);

  useEffect(() => {
    if (state.status === 'error') errorRef.current?.focus();
  }, [state]);

  useEffect(() => {
    if (!toggled.current) return;
    (confirming ? confirmRef : cancelRef).current?.focus();
  }, [confirming]);

  return (
    <div className="flex flex-col gap-3">
      {confirming ? (
        <form action={formAction} className="flex flex-col gap-3 sm:flex-row">
          <Button
            ref={confirmRef}
            type="submit"
            variant="destructive"
            disabled={pending}
            className="h-11 w-full md:h-9 sm:w-auto"
          >
            {t('confirmCancel')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full md:h-9 sm:w-auto"
            onClick={() => {
              toggled.current = true;
              setConfirming(false);
            }}
          >
            {t('keep')}
          </Button>
        </form>
      ) : (
        <Button
          ref={cancelRef}
          type="button"
          variant="outline"
          className="h-11 w-full md:h-9 sm:w-auto"
          onClick={() => {
            toggled.current = true;
            setConfirming(true);
          }}
        >
          {t('cancel')}
        </Button>
      )}
      {state.status === 'error' ? (
        <FormMessage tone="danger" ref={errorRef} tabIndex={-1}>
          {t('cancelFailed')}
        </FormMessage>
      ) : null}
    </div>
  );
}
