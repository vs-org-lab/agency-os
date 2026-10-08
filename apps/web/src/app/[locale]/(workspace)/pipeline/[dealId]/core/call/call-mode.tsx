'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@agency-os/i18n';
import { Button } from '@agency-os/ui/components/button';
import { Label } from '@agency-os/ui/components/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@agency-os/ui/components/tabs';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import { SubmitButton } from '@/components/forms/submit-button';
import { Link } from '@/i18n/navigation';
import type { BriefingGuide } from '@/modules/diagnosis';
import { saveNoteAction, saveTranscriptAction } from '../actions';
import { noteBody, type BriefingNoteView } from '../briefing-section';
import { EvidenceButton } from '../findings-section';
import { NoteField } from '../note-field';

type Observation = {
  id: string;
  title: string;
  description: string;
  evidenceKind: 'file' | 'link' | 'number' | 'page' | null;
  evidenceValue: string | null;
};

export function CallMode({
  engagementId,
  dealId,
  companyName,
  guide,
  notes,
  observations,
  transcript,
  locale,
}: {
  engagementId: string;
  dealId: string;
  companyName: string;
  guide: BriefingGuide;
  notes: BriefingNoteView[];
  observations: Observation[];
  transcript: string | null;
  locale: Locale;
}) {
  const t = useTranslations('diagnosis');
  const [index, setIndex] = useState(0);
  const [transcriptState, transcriptAction] = useActionState(
    saveTranscriptAction.bind(null, engagementId, dealId),
    { status: 'idle' },
  );
  const block = guide.blocks[index];
  if (!block) return null;
  const save = (blockId: string, questionId: string | null) => (body: string) =>
    saveNoteAction(engagementId, blockId, questionId, body);

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-body-sm text-text-secondary">
            {t('call.heading', { company: companyName })}
          </span>
          <Link href={`/pipeline/${dealId}`} className="text-body-sm text-link hover:underline">
            {t('call.exit')}
          </Link>
        </div>
      </header>

      <Tabs defaultValue="briefing">
        <TabsList aria-label={t('call.tabs.label')}>
          <TabsTrigger value="briefing">{t('call.tabs.briefing')}</TabsTrigger>
          <TabsTrigger value="observations">{t('call.tabs.observations')}</TabsTrigger>
          <TabsTrigger value="transcript">{t('call.tabs.transcript')}</TabsTrigger>
        </TabsList>

        <TabsContent value="briefing" className="flex flex-col gap-6 pt-6">
          <div className="flex flex-col gap-2">
            <div
              className="flex gap-1"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={guide.blocks.length}
              aria-valuenow={index + 1}
              aria-label={t('call.progress', {
                current: index + 1,
                total: guide.blocks.length,
              })}
            >
              {guide.blocks.map((entry, position) => (
                <span
                  key={entry.id}
                  className={
                    position <= index
                      ? 'h-1 flex-1 rounded-full bg-text'
                      : 'h-1 flex-1 rounded-full bg-border'
                  }
                />
              ))}
            </div>
            <span className="text-caption text-text-secondary">
              {t('call.progress', { current: index + 1, total: guide.blocks.length })}
            </span>
          </div>

          <div key={block.id} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <h1 className="text-title text-text">{block.title[locale]}</h1>
              <p className="text-body text-text-secondary">
                {t('call.blockMeta', { goal: block.goal[locale], minutes: block.minutes })}
              </p>
            </div>
            {block.questions.map((question) => (
              <NoteField
                key={question.id}
                id={`call-${question.id}`}
                label={question.text[locale]}
                initialValue={noteBody(notes, block.id, question.id)}
                save={save(block.id, question.id)}
                rows={3}
              />
            ))}
            <NoteField
              id={`call-${block.id}`}
              label={t('briefing.blockNotes')}
              initialValue={noteBody(notes, block.id, null)}
              save={save(block.id, null)}
              rows={4}
            />
          </div>

          <nav className="flex items-center justify-between gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="ghost"
              disabled={index === 0}
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
            >
              {t('call.back')}
            </Button>
            <Button
              type="button"
              disabled={index === guide.blocks.length - 1}
              onClick={() => setIndex((value) => Math.min(guide.blocks.length - 1, value + 1))}
            >
              {t('call.next')}
            </Button>
          </nav>
        </TabsContent>

        <TabsContent value="observations" className="flex flex-col gap-3 pt-6">
          {observations.length === 0 ? (
            <p className="text-body text-text-secondary">{t('call.noObservations')}</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {observations.map((observation) => (
                <li
                  key={observation.id}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
                >
                  <span className="text-title-sm text-text">{observation.title}</span>
                  {observation.description ? (
                    <p className="text-body text-text-secondary">{observation.description}</p>
                  ) : null}
                  {observation.evidenceKind === 'file' ? (
                    <div>
                      <EvidenceButton
                        findingId={observation.id}
                        label={t('findings.viewEvidence')}
                      />
                    </div>
                  ) : observation.evidenceKind === 'link' && observation.evidenceValue ? (
                    <a
                      href={observation.evidenceValue}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-body-sm text-link hover:underline"
                    >
                      {t('findings.viewEvidence')}
                    </a>
                  ) : observation.evidenceValue ? (
                    <span className="text-body-sm text-text-secondary">
                      {observation.evidenceValue}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </TabsContent>

        <TabsContent value="transcript" className="pt-6">
          <form action={transcriptAction} className="flex flex-col gap-2">
            <Label htmlFor="call-transcript">{t('briefing.transcript')}</Label>
            <Textarea
              id="call-transcript"
              name="transcript"
              rows={14}
              defaultValue={transcript ?? ''}
              maxLength={200_000}
            />
            {transcriptState.status === 'saved' ? (
              <FormMessage tone="success">{t('briefing.saved')}</FormMessage>
            ) : null}
            <div className="md:w-56">
              <SubmitButton>{t('briefing.saveTranscript')}</SubmitButton>
            </div>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
