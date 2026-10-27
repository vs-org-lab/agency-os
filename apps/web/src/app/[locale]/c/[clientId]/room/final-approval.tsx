'use client';

import { useState, useTransition } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { FormMessage } from '@/components/forms/form-message';
import type { ProjectView } from '@/modules/rooms';
import { roomError, type ActionResult, type RoomError } from './room-errors';

type Feedback =
  { tone: 'success'; key: 'requested' | 'withdrawn' } | { tone: 'danger'; error: RoomError };

/**
 * The end of the process (spec 2D.2, decision 5): once every phase is done the team asks for the
 * client's final approval; approved, the project shows its delivery date.
 */
export function FinalApprovalCard({
  project,
  writable,
  request,
  withdraw,
}: {
  project: Pick<ProjectView, 'id' | 'status' | 'phases' | 'finalApproval' | 'deliveredAt'>;
  writable: boolean;
  request: (projectId: string) => Promise<ActionResult>;
  withdraw: (approvalId: string) => Promise<ActionResult>;
}) {
  const t = useTranslations('rooms.delivery');
  const format = useFormatter();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, startTransition] = useTransition();

  const allDone = project.phases.every((phase) => phase.status === 'done');
  if (project.status !== 'delivered' && (project.status !== 'completed' || !allDone)) return null;

  const run = (key: 'requested' | 'withdrawn', action: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await action().catch(() => ({ ok: false, code: 'not_found' }) as const);
      setFeedback(
        result.ok ? { tone: 'success', key } : { tone: 'danger', error: roomError(result.code) },
      );
    });

  const approval = project.finalApproval;
  return (
    <section
      aria-labelledby="final-approval"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <h2 id="final-approval" className="text-heading text-text">
        {t('title')}
      </h2>
      {project.status === 'delivered' ? (
        <p className="text-body-sm text-text">
          {t('delivered', {
            date: format.dateTime(new Date(project.deliveredAt ?? Date.now()), {
              dateStyle: 'long',
            }),
          })}
        </p>
      ) : approval?.status === 'pending' ? (
        <>
          <p className="text-body-sm text-text-secondary">{t('waiting')}</p>
          {writable ? (
            <div>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => run('withdrawn', () => withdraw(approval.id))}
              >
                {t('withdraw')}
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p className="text-body-sm text-text-secondary">{t('ready')}</p>
          {approval?.status === 'changes_requested' && approval.comment ? (
            <div className="flex flex-col gap-1 rounded-md bg-surface-muted p-3">
              <span className="text-caption text-text-secondary">{t('changesRequested')}</span>
              <p className="text-body-sm text-text">{approval.comment}</p>
            </div>
          ) : null}
          {writable ? (
            <div>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run('requested', () => request(project.id))}
              >
                {t('request')}
              </Button>
            </div>
          ) : null}
        </>
      )}
      <div aria-live="polite">
        {feedback?.tone === 'success' ? (
          <FormMessage tone="success">{t(`done.${feedback.key}`)}</FormMessage>
        ) : null}
        {feedback?.tone === 'danger' ? (
          <FormMessage tone="danger">{t(`errors.${feedback.error}`)}</FormMessage>
        ) : null}
      </div>
    </section>
  );
}
