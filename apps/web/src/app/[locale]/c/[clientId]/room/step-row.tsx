'use client';

import { useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Check, Circle, CircleDot, Eye } from 'lucide-react';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import { ClientAvatar } from '@agency-os/ui/components/client-avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@agency-os/ui/components/dialog';
import { m, transitions } from '@agency-os/ui/motion';
import { cn } from '@agency-os/ui/lib/utils';
import type { Person, StepStatus, StepView } from '@/modules/rooms';

const STATUS_ICON = { todo: Circle, in_progress: CircleDot, done: Check } as const;

/**
 * One step as a compact row. The circle moves the step along: start it, finish it or reopen it.
 * Reopening a step the client has already seen asks for confirmation first.
 */
export function StepRow({
  step,
  assignee,
  canEdit,
  pending = false,
  onOpen,
  onToggle,
}: {
  step: StepView;
  assignee?: Person | null;
  /** Whether the viewer can change the step's status. */
  canEdit: boolean;
  pending?: boolean;
  onOpen: () => void;
  /** `done` is true when the step is being finished, false when it is started or reopened. */
  onToggle: (done: boolean) => Promise<void>;
}) {
  const t = useTranslations('rooms');
  const format = useFormatter();
  const [confirming, setConfirming] = useState(false);
  const Icon = STATUS_ICON[step.status];
  const finishing = step.status === 'in_progress';
  const needsConfirmation = step.status === 'done' && step.shared;

  const toggle = () => {
    if (needsConfirmation) {
      setConfirming(true);
      return;
    }
    void onToggle(finishing);
  };

  return (
    <m.li
      layout
      transition={transitions.base}
      className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
    >
      <button
        type="button"
        aria-label={t(`step.next.${step.status}`, { name: step.name })}
        disabled={!canEdit || pending}
        onClick={toggle}
        className={cn(
          'inline-flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors',
          step.status === 'done'
            ? 'border-success bg-success-bg text-success'
            : step.status === 'in_progress'
              ? 'border-info bg-info-bg text-info'
              : 'border-border-strong text-text-tertiary',
          canEdit && !pending ? 'hover:border-text' : 'cursor-default opacity-70',
        )}
      >
        <Icon aria-hidden className="size-3.5" />
      </button>

      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'min-w-0 flex-1 truncate text-left text-body-sm font-medium hover:underline',
          step.status === 'done' ? 'text-text-secondary' : 'text-text',
        )}
      >
        {step.name}
      </button>

      {step.visibleToClient ? (
        <span className="text-text-tertiary">
          <Eye aria-hidden className="size-4" />
          <span className="sr-only">{t('step.visible')}</span>
        </span>
      ) : null}
      {step.reopened ? <Badge variant="outline">{t('step.reopened')}</Badge> : null}
      {assignee ? (
        <span className="flex items-center gap-1.5">
          <ClientAvatar id={assignee.id} name={assignee.name} size="sm" />
          <span className="sr-only">{assignee.name}</span>
        </span>
      ) : null}
      <span className="w-20 shrink-0 text-right text-caption tabular-nums text-text-secondary">
        {step.dueOn
          ? format.dateTime(new Date(`${step.dueOn}T12:00:00Z`), { dateStyle: 'short' })
          : t('step.noDate')}
      </span>
      <Badge variant={step.status === 'done' ? 'secondary' : 'outline'}>
        {t(`stepStatus.${step.status as StepStatus}`)}
      </Badge>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent
          role="alertdialog"
          showCloseButton={false}
          closeLabel={t('step.reopenCancel')}
        >
          <DialogHeader>
            <DialogTitle>{t('step.reopenTitle')}</DialogTitle>
            <DialogDescription>{t('step.reopenBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              {t('step.reopenCancel')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setConfirming(false);
                void onToggle(false);
              }}
            >
              {t('step.reopenConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </m.li>
  );
}
