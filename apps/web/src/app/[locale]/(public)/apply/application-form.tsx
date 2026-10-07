'use client';

import { useActionState, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@agency-os/i18n';
import { Button } from '@agency-os/ui/components/button';
import { Checkbox } from '@agency-os/ui/components/checkbox';
import { Label } from '@agency-os/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@agency-os/ui/components/radio-group';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import {
  isPersonalEmail,
  visibleQuestions,
  type ApplicationAnswers,
  type ApplicationFormDefinition,
  type FormQuestion,
} from '@/modules/commercial';
import { CONSENT_TEXT_VERSION, HONEYPOT_FIELD, type ApplyActionState } from './apply-state';

type Draft = { step: number; answers: ApplicationAnswers; startedAt: number };

type ApplicationFormProps = {
  definition: ApplicationFormDefinition;
  version: number;
  embed: boolean;
  action: (state: ApplyActionState, formData: FormData) => Promise<ApplyActionState>;
};

const EMPTY_ANSWERS: ApplicationAnswers = {
  contact: { fullName: '', email: '' },
  company: { name: '', website: '' },
  choices: {},
  texts: {},
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UTM_KEYS = ['source', 'medium', 'campaign', 'term', 'content'] as const;

function draftKey(version: number): string {
  return `apply-draft-v${version}`;
}

function readDraft(version: number): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(draftKey(version));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (
      typeof parsed.step !== 'number' ||
      typeof parsed.startedAt !== 'number' ||
      !parsed.answers
    ) {
      return null;
    }
    return {
      step: parsed.step,
      startedAt: parsed.startedAt,
      answers: { ...EMPTY_ANSWERS, ...parsed.answers },
    };
  } catch {
    return null;
  }
}

function writeDraft(version: number, draft: Draft): void {
  try {
    window.sessionStorage.setItem(draftKey(version), JSON.stringify(draft));
  } catch {
    return;
  }
}

function collectSource() {
  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = params.get(`utm_${key}`);
    if (value) utm[key] = value;
  }
  return {
    utm,
    landingPage: window.location.pathname,
    referrer: document.referrer || null,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
  };
}

function isAnswered(
  question: FormQuestion,
  answers: ApplicationAnswers,
): 'ok' | 'required' | 'email' {
  switch (question.kind) {
    case 'contact':
      if (!answers.contact.fullName.trim() || !answers.contact.email.trim()) return 'required';
      return EMAIL_PATTERN.test(answers.contact.email.trim()) ? 'ok' : 'email';
    case 'company':
      return answers.company.name.trim() ? 'ok' : 'required';
    case 'single_choice':
      return !question.required || answers.choices[question.id] ? 'ok' : 'required';
    case 'long_text':
      return !question.required || (answers.texts[question.id] ?? '').trim() ? 'ok' : 'required';
  }
}

export function ApplicationForm({ definition, version, embed, action }: ApplicationFormProps) {
  const t = useTranslations('publicApply');
  const locale = useLocale() as Locale;
  const [state, formAction] = useActionState(action, { status: 'idle' });
  const [draft, setDraft] = useState<Draft>(() => ({
    step: 0,
    answers: EMPTY_ANSWERS,
    startedAt: Date.now(),
  }));
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState<'required' | 'email' | 'consent' | null>(null);
  const [consent, setConsent] = useState(false);
  const [source, setSource] = useState<ReturnType<typeof collectSource> | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const saved = readDraft(version);
    if (saved) setDraft(saved);
    setSource(collectSource());
    setRestored(true);
  }, [version]);

  useEffect(() => {
    if (restored) writeDraft(version, draft);
  }, [draft, restored, version]);

  const questions = useMemo(
    () => visibleQuestions(definition, draft.answers.choices),
    [definition, draft.answers.choices],
  );
  const step = Math.min(draft.step, questions.length - 1);
  const question = questions[step];
  const isLast = step === questions.length - 1;

  useEffect(() => {
    if (restored) headingRef.current?.focus();
  }, [step, restored]);

  if (!question) return null;

  const updateAnswers = (change: (answers: ApplicationAnswers) => ApplicationAnswers) => {
    setError(null);
    setDraft((current) => ({ ...current, answers: change(current.answers) }));
  };

  const goTo = (target: number) => {
    setError(null);
    setDraft((current) => ({ ...current, step: target }));
  };

  const advance = () => {
    const verdict = isAnswered(question, draft.answers);
    if (verdict !== 'ok') {
      setError(verdict);
      return;
    }
    goTo(step + 1);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const verdict = isAnswered(question, draft.answers);
    if (verdict !== 'ok') {
      event.preventDefault();
      setError(verdict);
      return;
    }
    if (!consent) {
      event.preventDefault();
      setError('consent');
    }
  };

  const label = question.label[locale];
  const email = draft.answers.contact.email.trim();
  const choiceValue = draft.answers.choices[question.id] ?? '';

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <input type="hidden" name="answers" value={JSON.stringify(draft.answers)} />
      <input type="hidden" name="source" value={JSON.stringify(source ?? {})} />
      <input type="hidden" name="startedAt" value={String(draft.startedAt)} />
      <input type="hidden" name="consentTextVersion" value={CONSENT_TEXT_VERSION} />
      <input type="hidden" name="embed" value={embed ? '1' : ''} />
      <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label>
          {t('fax')}
          <input
            type="text"
            name={HONEYPOT_FIELD}
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-caption text-text-secondary">
          {t('progress', { current: step + 1, total: questions.length })}
        </p>
        <div
          className="h-1 w-full overflow-hidden rounded-full bg-surface-muted"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={questions.length}
          aria-valuenow={step + 1}
          aria-label={t('progress', { current: step + 1, total: questions.length })}
        >
          <div
            className="h-full bg-primary transition-[width] duration-base"
            style={{ width: `${((step + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-4">
        <legend className="sr-only">{label}</legend>
        <h2 ref={headingRef} tabIndex={-1} className="text-title text-text outline-none">
          {label}
        </h2>

        {question.kind === 'contact' ? (
          <>
            <TextField
              label={t('fields.fullName')}
              autoComplete="name"
              value={draft.answers.contact.fullName}
              onChange={(event) =>
                updateAnswers((answers) => ({
                  ...answers,
                  contact: { ...answers.contact, fullName: event.target.value },
                }))
              }
            />
            <TextField
              label={t('fields.email')}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={draft.answers.contact.email}
              error={error === 'email' ? t('errors.email') : undefined}
              hint={isPersonalEmail(email) ? t('personalEmail') : undefined}
              onChange={(event) =>
                updateAnswers((answers) => ({
                  ...answers,
                  contact: { ...answers.contact, email: event.target.value },
                }))
              }
            />
          </>
        ) : null}

        {question.kind === 'company' ? (
          <>
            <TextField
              label={t('fields.companyName')}
              autoComplete="organization"
              value={draft.answers.company.name}
              onChange={(event) =>
                updateAnswers((answers) => ({
                  ...answers,
                  company: { ...answers.company, name: event.target.value },
                }))
              }
            />
            <TextField
              label={t('fields.website')}
              inputMode="url"
              placeholder={t('fields.websitePlaceholder')}
              value={draft.answers.company.website ?? ''}
              onChange={(event) =>
                updateAnswers((answers) => ({
                  ...answers,
                  company: { ...answers.company, website: event.target.value },
                }))
              }
            />
          </>
        ) : null}

        {question.kind === 'single_choice' ? (
          <RadioGroup
            value={choiceValue}
            aria-label={label}
            onValueChange={(value) =>
              updateAnswers((answers) => ({
                ...answers,
                choices: { ...answers.choices, [question.id]: value },
              }))
            }
            className="flex flex-col gap-2"
          >
            {(question.options ?? []).map((option) => {
              const id = `${question.id}-${option.id}`;
              return (
                <Label
                  key={option.id}
                  htmlFor={id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 text-body text-text has-[[data-state=checked]]:border-border-strong has-[[data-state=checked]]:bg-surface-muted"
                >
                  <RadioGroupItem id={id} value={option.id} />
                  {option.label[locale]}
                </Label>
              );
            })}
          </RadioGroup>
        ) : null}

        {question.kind === 'long_text' ? (
          <Textarea
            aria-label={label}
            rows={5}
            maxLength={2000}
            value={draft.answers.texts[question.id] ?? ''}
            onChange={(event) =>
              updateAnswers((answers) => ({
                ...answers,
                texts: { ...answers.texts, [question.id]: event.target.value },
              }))
            }
            className="text-body"
          />
        ) : null}

        {error === 'required' ? (
          <FormMessage tone="danger">{t('errors.required')}</FormMessage>
        ) : null}
      </fieldset>

      {isLast ? (
        <div className="flex items-start gap-3">
          <Checkbox
            id="apply-consent"
            name="consent"
            checked={consent}
            onCheckedChange={(checked) => {
              setConsent(checked === true);
              setError(null);
            }}
          />
          <Label htmlFor="apply-consent" className="text-body-sm text-text-secondary">
            {t('consent')}
          </Label>
        </div>
      ) : null}
      {error === 'consent' ? <FormMessage tone="danger">{t('errors.consent')}</FormMessage> : null}
      {state.status === 'throttled' ? (
        <FormMessage tone="danger">{t('errors.throttled')}</FormMessage>
      ) : null}
      {state.status === 'invalid' ? (
        <FormMessage tone="danger">{t('errors.invalid')}</FormMessage>
      ) : null}
      {state.status === 'error' ? (
        <FormMessage tone="danger">{t('errors.generic')}</FormMessage>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        {step > 0 ? (
          <Button
            type="button"
            variant="ghost"
            className="h-11 md:h-9"
            onClick={() => goTo(step - 1)}
          >
            {t('back')}
          </Button>
        ) : (
          <span />
        )}
        {isLast ? (
          <div className="sm:w-48">
            <SubmitButton>{t('submit')}</SubmitButton>
          </div>
        ) : (
          <Button type="button" className="h-11 md:h-9 sm:w-48" onClick={advance}>
            {t('next')}
          </Button>
        )}
      </div>
    </form>
  );
}
