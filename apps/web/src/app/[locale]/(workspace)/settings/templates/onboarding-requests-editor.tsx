'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Label } from '@agency-os/ui/components/label';
import {
  answerValues,
  MAX_ONBOARDING_REQUESTS,
  ONBOARDING_MODULE_CODES,
  ONBOARDING_REQUEST_KINDS,
  withSuggestedRequests,
  type BriefingGuide,
  type OnboardingCondition,
  type OnboardingRequest,
} from '@/modules/diagnosis';
import { LocalizedFields, newIdentifier, SELECT } from './template-fields';

type Locale = 'pt-PT' | 'en';

/**
 * The onboarding requests of the briefing template: what the portal asks the client, and when.
 * An answer condition offers only the questions that have a structured answer.
 */
export function OnboardingRequestsEditor({
  guide,
  onChange,
}: {
  guide: BriefingGuide;
  onChange: (guide: BriefingGuide) => void;
}) {
  const t = useTranslations('clientOnboarding');
  const locale = useLocale() as Locale;
  const structured = guide.blocks.flatMap((block) =>
    block.questions.flatMap((question) => (question.answer ? [question] : [])),
  );

  const valueLabel = (questionId: string, value: string) => {
    const answer = structured.find((question) => question.id === questionId)?.answer;
    if (answer?.kind === 'choice') {
      return answer.options.find((option) => option.id === value)?.label[locale] || value;
    }
    return t(`yesNo.${value as 'yes' | 'no'}`);
  };

  const update = (index: number, change: (request: OnboardingRequest) => OnboardingRequest) =>
    onChange({
      ...guide,
      onboarding: guide.onboarding.map((request, position) =>
        position === index ? change(request) : request,
      ),
    });

  const conditionFor = (type: OnboardingCondition['type']): OnboardingCondition | null => {
    if (type === 'always') return { type };
    if (type === 'module') return { type, code: 'A' };
    const first = structured[0];
    if (!first?.answer) return null;
    return { type, questionId: first.id, equals: answerValues(first.answer)[0] ?? 'yes' };
  };

  return (
    <fieldset className="flex flex-col gap-3 border-t border-border pt-4">
      <legend className="text-label text-text">{t('editor.title')}</legend>
      <p className="max-w-[72ch] text-body-sm text-text-secondary">{t('editor.description')}</p>
      {guide.onboarding.map((request, index) => {
        const id = `onboarding-${request.id}`;
        return (
          <div key={request.id} className="flex flex-col gap-3 rounded-md border border-border p-3">
            <span className="text-body-sm font-medium text-text">
              {t('editor.request', { number: index + 1 })}
            </span>
            <LocalizedFields
              id={`${id}-title`}
              label={t('editor.requestTitle')}
              value={request.title}
              onChange={(title) => update(index, (current) => ({ ...current, title }))}
            />
            <LocalizedFields
              id={`${id}-body`}
              label={t('editor.requestBody')}
              value={request.body}
              multiline
              onChange={(body) => update(index, (current) => ({ ...current, body }))}
            />
            <div className="flex flex-wrap gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${id}-kind`}>{t('editor.kind')}</Label>
                <select
                  id={`${id}-kind`}
                  className={SELECT}
                  value={request.kind}
                  onChange={(event) =>
                    update(index, (current) => ({
                      ...current,
                      kind: event.target.value as OnboardingRequest['kind'],
                    }))
                  }
                >
                  {ONBOARDING_REQUEST_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`kinds.${kind}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${id}-when`}>{t('editor.when')}</Label>
                <select
                  id={`${id}-when`}
                  className={SELECT}
                  value={request.when.type}
                  onChange={(event) => {
                    const when = conditionFor(event.target.value as OnboardingCondition['type']);
                    if (when) update(index, (current) => ({ ...current, when }));
                  }}
                >
                  <option value="always">{t('editor.whenAlways')}</option>
                  <option value="answer" disabled={structured.length === 0}>
                    {t('editor.whenAnswer')}
                  </option>
                  <option value="module">{t('editor.whenModule')}</option>
                </select>
              </div>
              {request.when.type === 'module' ? (
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${id}-module`}>{t('editor.module')}</Label>
                  <select
                    id={`${id}-module`}
                    className={SELECT}
                    value={request.when.code}
                    onChange={(event) =>
                      update(index, (current) => ({
                        ...current,
                        when: {
                          type: 'module',
                          code: event.target.value as (typeof ONBOARDING_MODULE_CODES)[number],
                        },
                      }))
                    }
                  >
                    {ONBOARDING_MODULE_CODES.map((code) => (
                      <option key={code} value={code}>
                        {t('editor.moduleOption', { code, name: t(`modules.${code}`) })}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {request.when.type === 'answer'
                ? (() => {
                    const { questionId, equals } = request.when;
                    const question = structured.find((entry) => entry.id === questionId);
                    return (
                      <>
                        <div className="flex min-w-64 flex-1 flex-col gap-1">
                          <Label htmlFor={`${id}-question`}>{t('editor.question')}</Label>
                          <select
                            id={`${id}-question`}
                            className={SELECT}
                            value={questionId}
                            onChange={(event) => {
                              const next = structured.find(
                                (entry) => entry.id === event.target.value,
                              );
                              const answer = next?.answer;
                              if (!next || !answer) return;
                              update(index, (current) => ({
                                ...current,
                                when: {
                                  type: 'answer',
                                  questionId: next.id,
                                  equals: answerValues(answer)[0] ?? 'yes',
                                },
                              }));
                            }}
                          >
                            {question ? null : <option value={questionId}>{questionId}</option>}
                            {structured.map((entry) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.text[locale] || entry.id}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={`${id}-equals`}>{t('editor.equals')}</Label>
                          <select
                            id={`${id}-equals`}
                            className={SELECT}
                            value={equals}
                            onChange={(event) =>
                              update(index, (current) => ({
                                ...current,
                                when: { type: 'answer', questionId, equals: event.target.value },
                              }))
                            }
                          >
                            {(question?.answer ? answerValues(question.answer) : [equals]).map(
                              (value) => (
                                <option key={value} value={value}>
                                  {valueLabel(questionId, value)}
                                </option>
                              ),
                            )}
                          </select>
                        </div>
                      </>
                    );
                  })()
                : null}
            </div>
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  onChange({
                    ...guide,
                    onboarding: guide.onboarding.filter((_, position) => position !== index),
                  })
                }
              >
                {t('editor.removeRequest')}
              </Button>
            </div>
          </div>
        );
      })}
      {structured.length === 0 ? (
        <p className="text-caption text-text-tertiary">{t('editor.noStructured')}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={guide.onboarding.length >= MAX_ONBOARDING_REQUESTS}
          onClick={() =>
            onChange({
              ...guide,
              onboarding: [
                ...guide.onboarding,
                {
                  id: newIdentifier('request'),
                  kind: 'confirm',
                  title: { 'pt-PT': '', en: '' },
                  body: { 'pt-PT': '', en: '' },
                  when: { type: 'always' },
                },
              ],
            })
          }
        >
          {t('editor.addRequest')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const next = withSuggestedRequests(guide);
            onChange({ ...next, onboarding: next.onboarding.slice(0, MAX_ONBOARDING_REQUESTS) });
          }}
        >
          {t('editor.suggested')}
        </Button>
      </div>
    </fieldset>
  );
}
