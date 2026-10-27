'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@agency-os/ui/components/dialog';
import { FormMessage } from '@/components/forms/form-message';
import { reviewApplicationAction, type ReviewActionState } from './actions';

export function ReviewButtons({
  applicationId,
  companyName,
}: {
  applicationId: string;
  companyName: string;
}) {
  const t = useTranslations('commercial.applications');
  const [decision, setDecision] = useState<'a' | 'c' | null>(null);
  const [state, setState] = useState<ReviewActionState>({ status: 'idle' });
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    if (!decision) return;
    const chosen = decision;
    setDecision(null);
    startTransition(async () => {
      const result = await reviewApplicationAction(applicationId, chosen);
      setState(result);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          aria-label={`${t('approve')} · ${companyName}`}
          onClick={() => setDecision('a')}
        >
          {t('approve')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          aria-label={`${t('sendToC')} · ${companyName}`}
          onClick={() => setDecision('c')}
        >
          {t('sendToC')}
        </Button>
      </div>
      {state.status === 'error' ? (
        <FormMessage tone="danger">{t(`result.${state.code}`)}</FormMessage>
      ) : null}
      <Dialog open={decision !== null} onOpenChange={(open) => (open ? null : setDecision(null))}>
        <DialogContent closeLabel={t('confirm.cancel')}>
          <DialogHeader>
            <DialogTitle>
              {decision === 'a' ? t('confirm.approveTitle') : t('confirm.rejectTitle')}
            </DialogTitle>
            <DialogDescription>
              {decision === 'a' ? t('confirm.approveBody') : t('confirm.rejectBody')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDecision(null)}>
              {t('confirm.cancel')}
            </Button>
            <Button type="button" onClick={confirm}>
              {t('confirm.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
