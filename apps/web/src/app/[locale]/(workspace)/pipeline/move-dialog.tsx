'use client';

import { useEffect, useId, useState } from 'react';
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
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import {
  PIPELINE_STAGES,
  pipelineCodeMessageKey,
  stageOf,
  type PipelineCode,
} from '@/modules/commercial';

export function requiresReason(from: PipelineCode, to: PipelineCode): boolean {
  if (to === 'X.4') return true;
  const stage = stageOf(from);
  if (stage === 'off_cycle' || stageOf(to) !== stage) return false;
  const codes = PIPELINE_STAGES.find((entry) => entry.stage === stage)?.codes ?? [];
  return codes.indexOf(to) < codes.indexOf(from);
}

export function MoveDialog({
  open,
  from,
  initialTarget,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  from: PipelineCode;
  initialTarget: PipelineCode | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (to: PipelineCode, reason: string | null) => void;
}) {
  const t = useTranslations('commercial');
  const targetId = useId();
  const reasonId = useId();
  const [target, setTarget] = useState<PipelineCode | ''>(initialTarget ?? '');
  const [reason, setReason] = useState('');
  const [missingReason, setMissingReason] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTarget(initialTarget ?? '');
    setReason('');
    setMissingReason(false);
  }, [open, initialTarget]);

  const submit = () => {
    if (!target) return;
    if (requiresReason(from, target) && reason.trim() === '') {
      setMissingReason(true);
      return;
    }
    onConfirm(target, reason.trim() === '' ? null : reason.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('board.moveDialog.cancel')}>
        <DialogHeader>
          <DialogTitle>{t('board.moveDialog.title')}</DialogTitle>
          <DialogDescription>{t('board.moveDialog.description')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={targetId}>{t('board.moveDialog.target')}</Label>
            <select
              id={targetId}
              value={target}
              onChange={(event) => {
                setTarget(event.target.value as PipelineCode);
                setMissingReason(false);
              }}
              className="h-11 rounded-md border border-border bg-surface px-3 text-body text-text md:h-9"
            >
              <option value="" disabled />
              {PIPELINE_STAGES.map((entry) => (
                <optgroup key={entry.stage} label={t(`pipeline.stages.${entry.stage}`)}>
                  {entry.codes
                    .filter((code) => code !== from)
                    .map((code) => (
                      <option key={code} value={code}>
                        {t('pipeline.codeOption', {
                          code,
                          name: t(`pipeline.codes.${pipelineCodeMessageKey(code)}` as never),
                        })}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={reasonId}>{t('board.moveDialog.reason')}</Label>
            <Textarea
              id={reasonId}
              rows={3}
              maxLength={500}
              value={reason}
              aria-invalid={missingReason || undefined}
              onChange={(event) => {
                setReason(event.target.value);
                setMissingReason(false);
              }}
            />
            {missingReason ? (
              <p role="alert" className="text-caption text-danger">
                {t('pipeline.rules.reason_required')}
              </p>
            ) : (
              <p className="text-caption text-text-tertiary">{t('board.moveDialog.reasonHint')}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('board.moveDialog.cancel')}
          </Button>
          <Button type="button" onClick={submit} disabled={!target}>
            {t('board.moveDialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
