'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@agency-os/i18n';
import { Button } from '@agency-os/ui/components/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@agency-os/ui/components/tabs';
import { Link } from '@/i18n/navigation';
import {
  AnswerChips,
  OnboardingPlan,
  useOnboardingAnswers,
} from '@/components/client-onboarding/onboarding-plan';
import type { BriefingGuide, CoreOnboarding } from '@/modules/diagnosis';
import type { RecordingView } from '@/modules/diagnosis/server';
import { saveAnswerAction, saveNoteAction, saveTranscriptAction } from '../actions';
import {
  confirmRecordingAction,
  retryRecordingAction,
  startRecordingAction,
} from '../recording-actions';
import { useNoteValues, type BriefingNoteView } from '../briefing-section';
import { EvidenceLink } from '../findings-section';
import { NoteField } from '../note-field';
import { TranscriptForm } from '../transcript-form';
import { RecordingPanel } from './recording-panel';

type Observation = {
  id: string;
  title: string;
  description: string;
  evidenceKind: 'file' | 'link' | 'number' | 'page' | null;
  evidenceValue: string | null;
};

const RECORDING_ACTIONS = {
  start: startRecordingAction,
  confirm: confirmRecordingAction,
  retry: retryRecordingAction,
};

export function CallMode({
  engagementId,
  dealId,
  companyName,
  guide,
  notes,
  observations,
  transcript,
  latestRecording,
  onboarding,
  locale,
}: {
  engagementId: string;
  dealId: string;
  companyName: string;
  guide: BriefingGuide;
  notes: BriefingNoteView[];
  observations: Observation[];
  transcript: string | null;
  latestRecording: RecordingView | null;
  onboarding: CoreOnboarding | null;
  locale: Locale;
}) {
  const t = useTranslations('diagnosis');
  const [index, setIndex] = useState(0);
  const { value, remember } = useNoteValues(notes);
  const answers = useOnboardingAnswers(onboarding?.answers ?? {}, (blockId, questionId, answer) =>
    saveAnswerAction(engagementId, blockId, questionId, answer),
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

      <RecordingPanel
        engagementId={engagementId}
        dealId={dealId}
        latest={latestRecording}
        actions={RECORDING_ACTIONS}
      />

      <Tabs defaultValue="briefing">
        <TabsList aria-label={t('call.tabs.label')}>
          <TabsTrigger value="briefing">{t('call.tabs.briefing')}</TabsTrigger>
          <TabsTrigger value="observations">{t('call.tabs.observations')}</TabsTrigger>
          <TabsTrigger value="transcript">{t('call.tabs.transcript')}</TabsTrigger>
          {onboarding ? (
            <TabsTrigger value="onboarding">{t('call.tabs.onboarding')}</TabsTrigger>
          ) : null}
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
          </div>

          <div key={block.id} className="rd-rise flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span
                aria-hidden
                className="font-mono text-[11px] tracking-[0.14em] text-text-tertiary uppercase tabular-nums"
              >
                {t('call.progress', { current: index + 1, total: guide.blocks.length })}
              </span>
              <h1 className="text-[clamp(1.75rem,3vw,2.25rem)] leading-tight font-semibold tracking-[-0.025em] text-text">
                {block.title[locale]}
              </h1>
              <p className="text-body text-text-secondary">
                {t('call.blockMeta', { goal: block.goal[locale], minutes: block.minutes })}
              </p>
            </div>
            {block.questions.map((question) => {
              const structured = onboarding?.questions.find(
                (entry) => entry.question.id === question.id,
              )?.question.answer;
              return (
                <div key={question.id} className="flex flex-col gap-2">
                  {structured ? (
                    <AnswerChips
                      label={question.text[locale]}
                      answer={structured}
                      value={answers.answers[question.id] ?? null}
                      onChange={(next) => answers.change(block.id, question.id, next)}
                    />
                  ) : null}
                  <NoteField
                    id={`call-${question.id}`}
                    label={question.text[locale]}
                    initialValue={value(block.id, question.id)}
                    onSaved={(body) => remember(block.id, question.id, body)}
                    save={save(block.id, question.id)}
                    rows={3}
                  />
                </div>
              );
            })}
            <NoteField
              id={`call-${block.id}`}
              label={t('briefing.blockNotes')}
              initialValue={value(block.id, null)}
              onSaved={(body) => remember(block.id, null, body)}
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

        {onboarding ? (
          <TabsContent value="onboarding" className="pt-6">
            <OnboardingPlan onboarding={onboarding} state={answers} />
          </TabsContent>
        ) : null}

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
                      <EvidenceLink findingId={observation.id} label={t('findings.viewEvidence')} />
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
          <TranscriptForm
            id="call-transcript"
            rows={14}
            initialValue={transcript ?? ''}
            save={(text) => saveTranscriptAction(engagementId, dealId, text)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
