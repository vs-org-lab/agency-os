'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import {
  maxScore,
  scoreApplication,
  visibleQuestions,
  type ApplicationFormDefinition,
  type FormOption,
  type FormQuestion,
} from '@/modules/commercial';

export type PublishResult = { ok: true; version: number } | { ok: false; issues: string[] };

type EditorProps = {
  definition: ApplicationFormDefinition;
  version: number;
  publish: (definition: ApplicationFormDefinition) => Promise<PublishResult>;
};

const FIELD = 'h-11 rounded-md border border-border bg-surface px-3 text-body text-text md:h-9';

function newIdentifier(prefix: string, taken: string[]): string {
  let index = taken.length + 1;
  while (taken.includes(`${prefix}_${index}`)) index += 1;
  return `${prefix}_${index}`;
}

function OptionEditor({
  option,
  questionId,
  onChange,
  onRemove,
}: {
  option: FormOption;
  questionId: string;
  onChange: (option: FormOption) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('settings.application.option');
  const base = `${questionId}-${option.id}`;
  return (
    <div className="grid gap-2 rounded-md bg-surface-muted p-3 md:grid-cols-[1fr_1fr_96px_auto_auto] md:items-end">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${base}-pt`}>{t('labelPt')}</Label>
        <Input
          id={`${base}-pt`}
          value={option.label['pt-PT']}
          onChange={(event) =>
            onChange({ ...option, label: { ...option.label, 'pt-PT': event.target.value } })
          }
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${base}-en`}>{t('labelEn')}</Label>
        <Input
          id={`${base}-en`}
          value={option.label.en}
          onChange={(event) =>
            onChange({ ...option, label: { ...option.label, en: event.target.value } })
          }
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${base}-points`}>{t('points')}</Label>
        <Input
          id={`${base}-points`}
          type="number"
          min={0}
          max={10}
          value={option.points ?? ''}
          onChange={(event) =>
            onChange({
              ...option,
              points: event.target.value === '' ? null : Number(event.target.value),
            })
          }
        />
      </div>
      <label className="flex min-h-11 items-center gap-2 text-body-sm text-text md:min-h-9">
        <input
          type="checkbox"
          checked={option.knockout}
          onChange={(event) => onChange({ ...option, knockout: event.target.checked })}
        />
        {t('knockout')}
      </label>
      <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
        {t('remove')}
      </Button>
    </div>
  );
}

function QuestionEditor({
  question,
  onChange,
  onRemove,
}: {
  question: FormQuestion;
  onChange: (question: FormQuestion) => void;
  onRemove: (() => void) | null;
}) {
  const t = useTranslations('settings.application');
  const options = question.options ?? [];
  const updateOption = (index: number, option: FormOption) =>
    onChange({ ...question, options: options.map((entry, at) => (at === index ? option : entry)) });

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-caption text-text-tertiary">
          {t(`question.kind.${question.kind}`)}
        </span>
        {onRemove ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            {t('question.remove')}
          </Button>
        ) : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${question.id}-label-pt`}>{t('question.labelPt')}</Label>
          <Input
            id={`${question.id}-label-pt`}
            value={question.label['pt-PT']}
            onChange={(event) =>
              onChange({ ...question, label: { ...question.label, 'pt-PT': event.target.value } })
            }
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${question.id}-label-en`}>{t('question.labelEn')}</Label>
          <Input
            id={`${question.id}-label-en`}
            value={question.label.en}
            onChange={(event) =>
              onChange({ ...question, label: { ...question.label, en: event.target.value } })
            }
          />
        </div>
      </div>
      {question.showIf ? (
        <p className="text-caption text-text-tertiary">{t('question.showIf')}</p>
      ) : null}
      <label className="flex items-center gap-2 text-body-sm text-text">
        <input
          type="checkbox"
          checked={question.required}
          onChange={(event) => onChange({ ...question, required: event.target.checked })}
        />
        {t('question.required')}
      </label>
      {question.kind === 'single_choice' ? (
        <div className="flex flex-col gap-2">
          {options.map((option, index) => (
            <OptionEditor
              key={option.id}
              option={option}
              questionId={question.id}
              onChange={(updated) => updateOption(index, updated)}
              onRemove={() =>
                onChange({ ...question, options: options.filter((_, at) => at !== index) })
              }
            />
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                onChange({
                  ...question,
                  options: [
                    ...options,
                    {
                      id: newIdentifier(
                        'option',
                        options.map((entry) => entry.id),
                      ),
                      label: { 'pt-PT': '', en: '' },
                      points: 0,
                      knockout: false,
                    },
                  ],
                })
              }
            >
              {t('option.add')}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ScorePreview({ definition }: { definition: ApplicationFormDefinition }) {
  const t = useTranslations('settings.application.preview');
  const [choices, setChoices] = useState<Record<string, string>>({});
  const questions = visibleQuestions(definition, choices).filter(
    (question) => question.kind === 'single_choice',
  );
  const result = scoreApplication(definition, {
    contact: { fullName: '', email: '' },
    company: { name: '', website: null },
    choices,
    texts: {},
  });

  return (
    <section
      aria-labelledby="score-preview-title"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <h2 id="score-preview-title" className="text-title-sm text-text">
        {t('title')}
      </h2>
      <p className="text-body-sm text-text-secondary">{t('description')}</p>
      {questions.map((question) => (
        <div key={question.id} className="flex flex-col gap-1">
          <Label htmlFor={`preview-${question.id}`}>{question.label['pt-PT']}</Label>
          <select
            id={`preview-${question.id}`}
            value={choices[question.id] ?? ''}
            onChange={(event) => setChoices({ ...choices, [question.id]: event.target.value })}
            className={FIELD}
          >
            <option value="" />
            {(question.options ?? []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label['pt-PT']}
              </option>
            ))}
          </select>
        </div>
      ))}
      <p className="text-title-sm text-text">
        {t('result', { score: result.score, path: result.path.toUpperCase() })}
      </p>
    </section>
  );
}

export function ApplicationFormEditor({ definition: initial, version, publish }: EditorProps) {
  const t = useTranslations('settings.application');
  const [definition, setDefinition] = useState(initial);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const total = useMemo(() => maxScore(definition), [definition]);
  const ids = definition.questions.map((question) => question.id);

  const updateQuestion = (index: number, question: FormQuestion) =>
    setDefinition({
      ...definition,
      questions: definition.questions.map((entry, at) => (at === index ? question : entry)),
    });

  const addQuestion = (kind: 'single_choice' | 'long_text') =>
    setDefinition({
      ...definition,
      questions: [
        ...definition.questions,
        {
          id: newIdentifier('question', ids),
          kind,
          required: true,
          label: { 'pt-PT': '', en: '' },
          ...(kind === 'single_choice'
            ? {
                options: [
                  { id: 'option_1', label: { 'pt-PT': '', en: '' }, points: 0, knockout: false },
                ],
              }
            : {}),
        },
      ],
    });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        <p className="flex flex-wrap gap-x-4 text-body-sm text-text-secondary">
          <span>{t('currentVersion', { version })}</span>
          <span>{t('maxScore', { score: total })}</span>
        </p>
        <section className="grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-2">
          <h2 className="text-title-sm text-text md:col-span-2">{t('thresholds.title')}</h2>
          {(['a', 'b'] as const).map((path) => (
            <div key={path} className="flex flex-col gap-1">
              <Label htmlFor={`threshold-${path}`}>{t(`thresholds.${path}`)}</Label>
              <Input
                id={`threshold-${path}`}
                type="number"
                min={0}
                max={100}
                value={definition.thresholds[path]}
                onChange={(event) =>
                  setDefinition({
                    ...definition,
                    thresholds: { ...definition.thresholds, [path]: Number(event.target.value) },
                  })
                }
              />
            </div>
          ))}
        </section>
        {definition.questions.map((question, index) => (
          <QuestionEditor
            key={question.id}
            question={question}
            onChange={(updated) => updateQuestion(index, updated)}
            onRemove={
              question.kind === 'contact' || question.kind === 'company'
                ? null
                : () =>
                    setDefinition({
                      ...definition,
                      questions: definition.questions.filter((_, at) => at !== index),
                    })
            }
          />
        ))}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => addQuestion('single_choice')}>
            {t('addChoice')}
          </Button>
          <Button type="button" variant="outline" onClick={() => addQuestion('long_text')}>
            {t('addText')}
          </Button>
        </div>
        <div aria-live="polite">
          {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
        </div>
        <div>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await publish(definition);
                setMessage(
                  result.ok
                    ? { tone: 'success', text: t('published', { version: result.version }) }
                    : { tone: 'danger', text: t('invalid', { issues: result.issues.join(', ') }) },
                );
              })
            }
          >
            {t('publish')}
          </Button>
        </div>
      </div>
      <aside>
        <ScorePreview definition={definition} />
      </aside>
    </div>
  );
}
