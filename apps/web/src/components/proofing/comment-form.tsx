'use client';

import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Checkbox } from '@agency-os/ui/components/checkbox';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import { VoiceNoteRecorder } from '@/components/media/voice-note-recorder';
import type { Recording } from '@/components/media/use-recorder';
import type { AnchorLabel } from './anchor-format';
import { proofError, type ProofActionResult, type ProofError } from './proof-errors';

/** A new comment, general or on the spot picked in the viewer; the team may keep it internal. */
export function CommentForm({
  anchor,
  audience,
  onClearAnchor,
  onSubmit,
  onVoiceNote,
}: {
  anchor: AnchorLabel;
  audience: 'team' | 'client';
  onClearAnchor: () => void;
  onSubmit: (body: string, internal: boolean) => Promise<ProofActionResult>;
  /** Sends a recorded voice note as the comment; resolves to false when it could not be sent. */
  onVoiceNote?: (recording: Recording, internal: boolean) => Promise<boolean>;
}) {
  const t = useTranslations('proofing');
  const id = useId();
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: true } | { ok: false; error: ProofError } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await onSubmit(body.trim(), internal).catch(
            () => ({ ok: false, code: 'not_found' }) as const,
          );
          if (result.ok) {
            setBody('');
            setInternal(false);
          }
          setOutcome(result.ok ? { ok: true } : { ok: false, error: proofError(result.code) });
        });
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-caption font-medium text-text-secondary">
          {anchor.key === 'general'
            ? t('comments.general')
            : anchor.key === 'point'
              ? t('comments.point', { number: anchor.number })
              : anchor.key === 'pagePoint'
                ? t('comments.pagePoint', { number: anchor.number, page: anchor.page })
                : t('comments.time', { number: anchor.number, time: anchor.time })}
        </span>
        {anchor.key === 'general' ? null : (
          <Button type="button" variant="ghost" size="sm" onClick={onClearAnchor}>
            {t('comments.clearAnchor')}
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-body`}>{t('comments.body')}</Label>
        <Textarea
          id={`${id}-body`}
          rows={3}
          required
          maxLength={2000}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setOutcome(null);
          }}
        />
      </div>
      {audience === 'team' ? (
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${id}-internal`}
            checked={internal}
            onCheckedChange={(checked) => setInternal(checked === true)}
          />
          <Label htmlFor={`${id}-internal`} className="font-normal">
            {t('comments.internal')}
          </Label>
        </div>
      ) : null}
      {onVoiceNote ? (
        <VoiceNoteRecorder submit={(recording) => onVoiceNote(recording, internal)} />
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || body.trim() === ''}>
          {t('comments.send')}
        </Button>
        {outcome?.ok === false ? (
          <FormMessage tone="danger">{t(`errors.${outcome.error}`)}</FormMessage>
        ) : null}
        {outcome?.ok ? <FormMessage tone="success">{t('comments.sent')}</FormMessage> : null}
      </div>
    </form>
  );
}
