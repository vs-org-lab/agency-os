'use client';

import { useActionState, useCallback, useEffect, useState, useTransition } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import type { Locale } from '@agency-os/i18n';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import { SubmitButton } from '@/components/forms/submit-button';
import { getPathname } from '@/i18n/navigation';
import type { RecordingView } from '@/modules/diagnosis/server';
import type { BriefingGuide } from '@/modules/diagnosis';
import {
  saveBuyerTestAction,
  saveNoteAction,
  saveTranscriptAction,
  shareBriefingAction,
} from './actions';
import { NoteField } from './note-field';
import { retryRecordingAction } from './recording-actions';
import { RecordingStatus } from './recording-status';
import { TranscriptForm } from './transcript-form';

export type BriefingNoteView = { blockId: string; questionId: string | null; body: string };

function noteKey(blockId: string, questionId: string | null): string {
  return `${blockId}:${questionId ?? ''}`;
}

function toValues(notes: BriefingNoteView[]): Record<string, string> {
  return Object.fromEntries(
    notes.map((note) => [noteKey(note.blockId, note.questionId), note.body]),
  );
}

/**
 * Keeps the latest saved text of every note on the client, so a field that unmounts and
 * mounts again (next block, another tab) shows what was saved rather than the first render.
 */
export function useNoteValues(notes: BriefingNoteView[]) {
  const [values, setValues] = useState(() => toValues(notes));
  useEffect(() => {
    setValues((current) => ({ ...current, ...toValues(notes) }));
  }, [notes]);
  const value = useCallback(
    (blockId: string, questionId: string | null) => values[noteKey(blockId, questionId)] ?? '',
    [values],
  );
  const remember = useCallback(
    (blockId: string, questionId: string | null, body: string) =>
      setValues((current) => ({ ...current, [noteKey(blockId, questionId)]: body })),
    [],
  );
  return { value, remember };
}

export function BriefingSection({
  engagementId,
  dealId,
  guide,
  notes,
  transcript,
  sharedAt,
  buyerTestUrl,
  latestRecording,
  writable,
  locale,
}: {
  engagementId: string;
  dealId: string;
  guide: BriefingGuide;
  notes: BriefingNoteView[];
  transcript: string | null;
  sharedAt: Date | null;
  buyerTestUrl: string | null;
  latestRecording: RecordingView | null;
  writable: boolean;
  locale: Locale;
}) {
  const t = useTranslations('diagnosis.briefing');
  const format = useFormatter();
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharing, startShare] = useTransition();
  const [buyerState, buyerAction] = useActionState(
    saveBuyerTestAction.bind(null, engagementId, dealId),
    { status: 'idle' },
  );
  const { value, remember } = useNoteValues(notes);
  const save = (blockId: string, questionId: string | null) => (body: string) =>
    saveNoteAction(engagementId, blockId, questionId, body);

  return (
    <section
      aria-labelledby="core-briefing-title"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
    >
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id="core-briefing-title" className="text-title-sm text-text">
            {t('title')}
          </h2>
          <p className="text-body-sm text-text-secondary">{t('description')}</p>
          {sharedAt ? (
            <p className="text-body-sm text-success">
              {t('shared', { date: format.dateTime(sharedAt, { dateStyle: 'medium' }) })}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            {/* A full document load: call mode carries its own permissions policy for recording. */}
            <a href={getPathname({ href: `/pipeline/${dealId}/core/call`, locale })}>
              {t('openCall')}
            </a>
          </Button>
          {writable && !sharedAt ? (
            <Button
              type="button"
              disabled={sharing}
              onClick={() =>
                startShare(async () => {
                  const result = await shareBriefingAction(engagementId, dealId);
                  setShareError(result.ok ? null : t(`errors.${result.code}` as never));
                })
              }
            >
              {t('share')}
            </Button>
          ) : null}
        </div>
      </header>
      {shareError ? <FormMessage tone="danger">{shareError}</FormMessage> : null}

      <ol className="flex flex-col gap-6">
        {guide.blocks.map((block) => (
          <li key={block.id} className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex flex-col gap-1">
              <h3 className="flex items-baseline gap-2 text-label text-text">
                {block.title[locale]}
                <span className="text-caption text-text-tertiary">
                  {t('minutes', { minutes: block.minutes })}
                </span>
              </h3>
              <p className="text-body-sm text-text-secondary">{block.goal[locale]}</p>
            </div>
            {block.questions.map((question) => (
              <NoteField
                key={question.id}
                id={`note-${block.id}-${question.id}`}
                label={question.text[locale]}
                initialValue={value(block.id, question.id)}
                onSaved={(body) => remember(block.id, question.id, body)}
                save={save(block.id, question.id)}
                rows={2}
                disabled={!writable}
              />
            ))}
            <NoteField
              id={`note-${block.id}`}
              label={t('blockNotes')}
              initialValue={value(block.id, null)}
              onSaved={(body) => remember(block.id, null, body)}
              save={save(block.id, null)}
              rows={3}
              disabled={!writable}
            />
          </li>
        ))}
      </ol>

      {writable ? (
        <div className="grid gap-4 border-t border-border pt-4 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <TranscriptForm
              id="core-transcript"
              initialValue={transcript ?? ''}
              save={(text) => saveTranscriptAction(engagementId, dealId, text)}
            />
            {latestRecording ? (
              <RecordingStatus
                latest={latestRecording}
                dealId={dealId}
                retry={retryRecordingAction}
              />
            ) : null}
          </div>
          <form action={buyerAction} className="flex flex-col gap-2">
            <Label htmlFor="core-buyer-test">{t('buyerTest')}</Label>
            <Input
              id="core-buyer-test"
              name="buyerTestUrl"
              type="url"
              defaultValue={buyerTestUrl ?? ''}
              aria-describedby="core-buyer-test-hint"
            />
            <p id="core-buyer-test-hint" className="text-caption text-text-tertiary">
              {t('buyerTestHint')}
            </p>
            {buyerState.status === 'error' ? (
              <FormMessage tone="danger">{t('invalidLink')}</FormMessage>
            ) : null}
            {buyerState.status === 'saved' ? (
              <FormMessage tone="success">{t('saved')}</FormMessage>
            ) : null}
            <div className="md:w-56">
              <SubmitButton>{t('saveBuyerTest')}</SubmitButton>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
