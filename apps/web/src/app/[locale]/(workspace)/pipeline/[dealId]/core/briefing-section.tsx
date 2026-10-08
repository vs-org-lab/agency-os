'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import type { Locale } from '@agency-os/i18n';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import { SubmitButton } from '@/components/forms/submit-button';
import { Link } from '@/i18n/navigation';
import type { BriefingGuide } from '@/modules/diagnosis';
import {
  saveBuyerTestAction,
  saveNoteAction,
  saveTranscriptAction,
  shareBriefingAction,
} from './actions';
import { NoteField } from './note-field';

export type BriefingNoteView = { blockId: string; questionId: string | null; body: string };

export function noteBody(
  notes: BriefingNoteView[],
  blockId: string,
  questionId: string | null,
): string {
  return (
    notes.find((note) => note.blockId === blockId && note.questionId === questionId)?.body ?? ''
  );
}

export function BriefingSection({
  engagementId,
  dealId,
  guide,
  notes,
  transcript,
  sharedAt,
  buyerTestUrl,
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
  writable: boolean;
  locale: Locale;
}) {
  const t = useTranslations('diagnosis.briefing');
  const format = useFormatter();
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharing, startShare] = useTransition();
  const [transcriptState, transcriptAction] = useActionState(
    saveTranscriptAction.bind(null, engagementId, dealId),
    { status: 'idle' },
  );
  const [buyerState, buyerAction] = useActionState(
    saveBuyerTestAction.bind(null, engagementId, dealId),
    { status: 'idle' },
  );
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
            <Link href={`/pipeline/${dealId}/core/call`}>{t('openCall')}</Link>
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
                initialValue={noteBody(notes, block.id, question.id)}
                save={save(block.id, question.id)}
                rows={2}
                disabled={!writable}
              />
            ))}
            <NoteField
              id={`note-${block.id}`}
              label={t('blockNotes')}
              initialValue={noteBody(notes, block.id, null)}
              save={save(block.id, null)}
              rows={3}
              disabled={!writable}
            />
          </li>
        ))}
      </ol>

      {writable ? (
        <div className="grid gap-4 border-t border-border pt-4 lg:grid-cols-2">
          <form action={transcriptAction} className="flex flex-col gap-2">
            <Label htmlFor="core-transcript">{t('transcript')}</Label>
            <Textarea
              id="core-transcript"
              name="transcript"
              rows={6}
              defaultValue={transcript ?? ''}
              maxLength={200_000}
            />
            {transcriptState.status === 'saved' ? (
              <FormMessage tone="success">{t('saved')}</FormMessage>
            ) : null}
            <div className="md:w-56">
              <SubmitButton>{t('saveTranscript')}</SubmitButton>
            </div>
          </form>
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
