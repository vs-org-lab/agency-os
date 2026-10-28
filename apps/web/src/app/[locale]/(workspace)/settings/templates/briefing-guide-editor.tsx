'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import type { BriefingAnswer, BriefingBlock, BriefingGuide, Localized } from '@/modules/diagnosis';
import { OnboardingRequestsEditor } from './onboarding-requests-editor';
import { LocalizedFields, newIdentifier, SELECT } from './template-fields';
import type { PublishResult } from './orbit-grid-editor';

type AnswerKind = 'none' | BriefingAnswer['kind'];

const EMPTY_TEXT: Localized = { 'pt-PT': '', en: '' };

function AnswerEditor({
  id,
  answer,
  onChange,
}: {
  id: string;
  answer: BriefingAnswer | undefined;
  onChange: (answer: BriefingAnswer | undefined) => void;
}) {
  const t = useTranslations('clientOnboarding.editor');
  const kind: AnswerKind = answer?.kind ?? 'none';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-answer`}>{t('answer')}</Label>
        <select
          id={`${id}-answer`}
          className={`${SELECT} w-56`}
          value={kind}
          onChange={(event) => {
            const next = event.target.value as AnswerKind;
            if (next === 'none') onChange(undefined);
            else if (next === 'yes_no') onChange({ kind: 'yes_no' });
            else
              onChange({
                kind: 'choice',
                options: [
                  { id: newIdentifier('option'), label: { ...EMPTY_TEXT } },
                  { id: newIdentifier('option'), label: { ...EMPTY_TEXT } },
                ],
              });
          }}
        >
          <option value="none">{t('answerNone')}</option>
          <option value="yes_no">{t('answerYesNo')}</option>
          <option value="choice">{t('answerChoice')}</option>
        </select>
      </div>
      {answer?.kind === 'choice' ? (
        <div className="flex flex-col gap-2 border-l-2 border-border pl-3">
          {answer.options.map((option, index) => (
            <div key={option.id} className="flex flex-col gap-1">
              <LocalizedFields
                id={`${id}-${option.id}`}
                label={t('option', { number: index + 1 })}
                value={option.label}
                onChange={(label) =>
                  onChange({
                    ...answer,
                    options: answer.options.map((entry) =>
                      entry.id === option.id ? { ...entry, label } : entry,
                    ),
                  })
                }
              />
              <div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={answer.options.length <= 2}
                  onClick={() =>
                    onChange({
                      ...answer,
                      options: answer.options.filter((entry) => entry.id !== option.id),
                    })
                  }
                >
                  {t('removeOption')}
                </Button>
              </div>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={answer.options.length >= 8}
              onClick={() =>
                onChange({
                  ...answer,
                  options: [
                    ...answer.options,
                    { id: newIdentifier('option'), label: { ...EMPTY_TEXT } },
                  ],
                })
              }
            >
              {t('addOption')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function BriefingGuideEditor({
  guide,
  version,
  publish,
}: {
  guide: BriefingGuide;
  version: number;
  publish: (definition: BriefingGuide) => Promise<PublishResult>;
}) {
  const t = useTranslations('settings.coreTemplates');
  const [draft, setDraft] = useState<BriefingGuide>(guide);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const updateBlock = (blockIndex: number, change: (block: BriefingBlock) => BriefingBlock) =>
    setDraft((current) => ({
      ...current,
      blocks: current.blocks.map((block, index) => (index === blockIndex ? change(block) : block)),
    }));

  const updateQuestion = (
    blockIndex: number,
    questionIndex: number,
    change: (question: BriefingBlock['questions'][number]) => BriefingBlock['questions'][number],
  ) =>
    updateBlock(blockIndex, (current) => ({
      ...current,
      questions: current.questions.map((entry, position) =>
        position === questionIndex ? change(entry) : entry,
      ),
    }));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-sm text-text-secondary">{t('version', { version })}</p>
      {draft.blocks.map((block, blockIndex) => (
        <fieldset key={block.id} className="flex flex-col gap-3 border-t border-border pt-4">
          <legend className="text-label text-text">
            {t('guide.block', { number: blockIndex + 1 })}
          </legend>
          <LocalizedFields
            id={`${block.id}-title`}
            label={t('guide.blockTitle')}
            value={block.title}
            onChange={(title) => updateBlock(blockIndex, (current) => ({ ...current, title }))}
          />
          <LocalizedFields
            id={`${block.id}-goal`}
            label={t('guide.goal')}
            value={block.goal}
            onChange={(goal) => updateBlock(blockIndex, (current) => ({ ...current, goal }))}
          />
          <div className="flex w-36 flex-col gap-1">
            <Label htmlFor={`${block.id}-minutes`}>{t('guide.minutes')}</Label>
            <Input
              id={`${block.id}-minutes`}
              type="number"
              min={1}
              max={120}
              value={block.minutes}
              onChange={(event) =>
                updateBlock(blockIndex, (current) => ({
                  ...current,
                  minutes: Number(event.target.value),
                }))
              }
            />
          </div>
          <span className="text-body-sm font-medium text-text">{t('guide.questions')}</span>
          {block.questions.map((question, questionIndex) => (
            <div
              key={question.id}
              className="flex flex-col gap-3 rounded-md border border-border p-3"
            >
              <LocalizedFields
                id={`${block.id}-${question.id}`}
                label={t('guide.question')}
                value={question.text}
                multiline
                onChange={(text) =>
                  updateQuestion(blockIndex, questionIndex, (entry) => ({ ...entry, text }))
                }
              />
              <AnswerEditor
                id={`${block.id}-${question.id}`}
                answer={question.answer}
                onChange={(answer) =>
                  updateQuestion(blockIndex, questionIndex, ({ answer: _previous, ...entry }) =>
                    answer ? { ...entry, answer } : entry,
                  )
                }
              />
              <div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={block.questions.length === 1}
                  onClick={() =>
                    updateBlock(blockIndex, (current) => ({
                      ...current,
                      questions: current.questions.filter(
                        (_, position) => position !== questionIndex,
                      ),
                    }))
                  }
                >
                  {t('guide.removeQuestion')}
                </Button>
              </div>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                updateBlock(blockIndex, (current) => ({
                  ...current,
                  questions: [
                    ...current.questions,
                    { id: newIdentifier('question'), text: { ...EMPTY_TEXT } },
                  ],
                }))
              }
            >
              {t('guide.addQuestion')}
            </Button>
          </div>
        </fieldset>
      ))}
      <OnboardingRequestsEditor guide={draft} onChange={setDraft} />
      {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
      <div>
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await publish(draft);
              setMessage(
                result.ok
                  ? { tone: 'success', text: t('published', { version: result.version }) }
                  : { tone: 'danger', text: t(`errors.${result.rule}` as never) },
              );
            })
          }
        >
          {t('publish')}
        </Button>
      </div>
    </div>
  );
}
