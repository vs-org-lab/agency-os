'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import type { BriefingBlock, BriefingGuide, Localized } from '@/modules/diagnosis';
import type { PublishResult } from './orbit-grid-editor';

function newQuestionId(): string {
  return `question_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

function LocalizedFields({
  id,
  label,
  value,
  multiline,
  onChange,
}: {
  id: string;
  label: string;
  value: Localized;
  multiline?: boolean;
  onChange: (value: Localized) => void;
}) {
  const t = useTranslations('settings.coreTemplates');
  const Field = multiline ? Textarea : Input;
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-pt`}>{label}</Label>
        <Field
          id={`${id}-pt`}
          value={value['pt-PT']}
          onChange={(event) => onChange({ ...value, 'pt-PT': event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-en`}>{t('english')}</Label>
        <Field
          id={`${id}-en`}
          value={value.en}
          onChange={(event) => onChange({ ...value, en: event.target.value })}
        />
      </div>
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
      blocks: current.blocks.map((block, index) => (index === blockIndex ? change(block) : block)),
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
              className="flex flex-col gap-2 rounded-md border border-border p-3"
            >
              <LocalizedFields
                id={`${block.id}-${question.id}`}
                label={t('guide.question')}
                value={question.text}
                multiline
                onChange={(text) =>
                  updateBlock(blockIndex, (current) => ({
                    ...current,
                    questions: current.questions.map((entry, position) =>
                      position === questionIndex ? { ...entry, text } : entry,
                    ),
                  }))
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
                    { id: newQuestionId(), text: { 'pt-PT': '', en: '' } },
                  ],
                }))
              }
            >
              {t('guide.addQuestion')}
            </Button>
          </div>
        </fieldset>
      ))}
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
