'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';

export type DecideApproval = (input: {
  approvalId: string;
  decision: 'approved' | 'changes_requested';
  comment: string;
}) => Promise<{ ok: true } | { ok: false; code: string }>;

type DecisionError = 'not_found' | 'comment_required' | 'invalid_input';

function decisionError(code: string): DecisionError {
  return code === 'comment_required' || code === 'invalid_input' ? code : 'not_found';
}

/** P-02: the decision maker approves, or asks for changes with a comment (RN-41). */
export function ApprovalDecision({
  approvalId,
  decide,
}: {
  approvalId: string;
  decide: DecideApproval;
}) {
  const t = useTranslations('portal.room');
  const router = useRouter();
  const [comment, setComment] = useState('');
  const [result, setResult] = useState<{ ok: true } | { ok: false; error: DecisionError } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const fieldId = `approval-${approvalId}-comment`;
  const hintId = `${fieldId}-hint`;

  const submit = (decision: 'approved' | 'changes_requested') =>
    startTransition(async () => {
      const outcome = await decide({ approvalId, decision, comment: comment.trim() }).catch(
        () => ({ ok: false, code: 'not_found' }) as const,
      );
      setResult(outcome.ok ? { ok: true } : { ok: false, error: decisionError(outcome.code) });
      if (outcome.ok) router.refresh();
    });

  if (result?.ok) return <FormMessage tone="success">{t('decided')}</FormMessage>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={fieldId}>{t('comment')}</Label>
        <Textarea
          id={fieldId}
          aria-describedby={hintId}
          rows={3}
          maxLength={2000}
          value={comment}
          onChange={(event) => {
            setComment(event.target.value);
            setResult(null);
          }}
        />
        <p id={hintId} className="text-caption text-text-tertiary">
          {t('commentHint')}
        </p>
      </div>
      {result?.ok === false ? (
        <FormMessage tone="danger">{t(`errors.${result.error}`)}</FormMessage>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending} onClick={() => submit('approved')}>
          {t('approve')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending || comment.trim() === ''}
          onClick={() => submit('changes_requested')}
        >
          {t('requestChanges')}
        </Button>
      </div>
    </div>
  );
}
