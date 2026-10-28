'use client';

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@agency-os/ui/lib/utils';
import { FormMessage } from '@/components/forms/form-message';
import { applicableRequests } from '@/modules/client-onboarding';
import { answerValues, type BriefingAnswer, type CoreOnboarding } from '@/modules/diagnosis';

type Locale = 'pt-PT' | 'en';

export type SaveAnswer = (
  blockId: string,
  questionId: string,
  answer: string | null,
) => Promise<boolean>;

/** The answer buttons of one structured question; choosing the current value clears it. */
export function AnswerChips({
  label,
  answer,
  value,
  onChange,
  disabled,
}: {
  label: string;
  answer: BriefingAnswer;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('clientOnboarding');
  const locale = useLocale() as Locale;
  const labelOf = (option: string) =>
    answer.kind === 'yes_no'
      ? t(`yesNo.${option as 'yes' | 'no'}`)
      : (answer.options.find((entry) => entry.id === option)?.label[locale] ?? option);

  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {answerValues(answer).map((option) => {
        const selected = option === value;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(selected ? null : option)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-body-sm transition-colors duration-(--duration-fast) disabled:opacity-60',
              selected
                ? 'border-text bg-text text-canvas'
                : 'border-border-strong text-text-secondary hover:border-text hover:text-text',
            )}
          >
            {selected ? <Check aria-hidden="true" className="size-3.5" /> : null}
            {labelOf(option)}
          </button>
        );
      })}
    </div>
  );
}

/** The answers and their saving, shared by the call and the Core tab. */
export function useOnboardingAnswers(initial: Record<string, string>, save: SaveAnswer) {
  const [answers, setAnswers] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const change = (blockId: string, questionId: string, value: string | null) => {
    const previous = answers[questionId] ?? null;
    setAnswers((current) => {
      const { [questionId]: _removed, ...rest } = current;
      return value === null ? rest : { ...rest, [questionId]: value };
    });
    startTransition(async () => {
      const ok = await save(blockId, questionId, value).catch(() => false);
      setFailed(!ok);
      if (!ok) {
        setAnswers((current) => {
          const { [questionId]: _removed, ...rest } = current;
          return previous === null ? rest : { ...rest, [questionId]: previous };
        });
      }
    });
  };

  return { answers, change, failed, pending };
}

/**
 * What the briefing will ask the client in the portal, live: the structured answers that shape
 * it and each request with whether it will be asked, depends on an answer or on the contract.
 */
export function OnboardingPlan({
  onboarding,
  state,
}: {
  onboarding: CoreOnboarding;
  state: ReturnType<typeof useOnboardingAnswers>;
}) {
  const t = useTranslations('clientOnboarding');
  const locale = useLocale() as Locale;
  const modules = new Set(onboarding.modules);
  const asked = new Set(
    applicableRequests(onboarding.requests, {
      answers: new Map(Object.entries(state.answers)),
      modules,
    }).map((request) => request.id),
  );

  return (
    <section aria-labelledby="onboarding-plan" className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h2 id="onboarding-plan" className="text-title-sm text-text">
          {t('plan.title')}
        </h2>
        <p className="text-body-sm text-text-secondary">{t('plan.description')}</p>
      </header>

      {onboarding.requests.length === 0 ? (
        <p className="text-body-sm text-text-secondary">{t('plan.empty')}</p>
      ) : (
        <>
          {onboarding.questions.length > 0 ? (
            <div className="flex flex-col gap-3">
              <h3 className="text-body-sm font-medium text-text">{t('plan.answers')}</h3>
              <ul className="flex flex-col gap-3">
                {onboarding.questions.map(({ blockId, question }) =>
                  question.answer ? (
                    <li key={question.id} className="flex flex-col gap-2">
                      <span className="text-body-sm text-text">{question.text[locale]}</span>
                      <AnswerChips
                        label={question.text[locale]}
                        answer={question.answer}
                        value={state.answers[question.id] ?? null}
                        onChange={(value) => state.change(blockId, question.id, value)}
                      />
                    </li>
                  ) : null,
                )}
              </ul>
            </div>
          ) : null}
          {state.failed ? <FormMessage tone="danger">{t('plan.saveFailed')}</FormMessage> : null}

          <div className="flex flex-col gap-2">
            <h3 className="text-body-sm font-medium text-text">{t('plan.requests')}</h3>
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {onboarding.requests.map((request) => {
                const status = asked.has(request.id)
                  ? { label: t('plan.status.asked'), tone: 'bg-success-bg text-success' }
                  : request.when.type === 'module'
                    ? {
                        label: t('plan.status.module', {
                          module: t(`modules.${request.when.code}`),
                        }),
                        tone: 'bg-surface-muted text-text-secondary',
                      }
                    : request.when.type === 'answer' && !(request.when.questionId in state.answers)
                      ? { label: t('plan.status.answer'), tone: 'bg-warning-bg text-warning' }
                      : {
                          label: t('plan.status.notAsked'),
                          tone: 'bg-surface-muted text-text-tertiary',
                        };
                return (
                  <li
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="text-body-sm font-medium text-text">
                        {request.title[locale]}
                      </span>
                      <span className="text-caption text-text-tertiary">
                        {t(`kinds.${request.kind}`)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-caption font-medium',
                        status.tone,
                      )}
                    >
                      {status.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
