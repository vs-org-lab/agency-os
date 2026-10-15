'use client';

import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import type { ConditionView } from '@/modules/outcomes';
import { outcomeError, useLongDate, type OutcomeError, type OutcomeResult } from './shared';

export type RecordCondition = (input: {
  conditionId: string;
  status: 'met' | 'failed' | 'pending';
  note?: string;
}) => Promise<OutcomeResult>;

export type AddCondition = (input: {
  outcomeId: string;
  description: string;
}) => Promise<OutcomeResult>;

type Feedback = 'recorded' | 'noteRequired' | OutcomeError | null;

/** "Cumprida a 2 de outubro de 2026", "Falhada a …" or "Por registar". */
export function useConditionStatus() {
  const t = useTranslations('outcomes.conditions.status');
  const longDate = useLongDate();
  return (condition: Pick<ConditionView, 'status' | 'recordedOn'>) =>
    condition.status === 'pending' || !condition.recordedOn
      ? t('pending')
      : t(condition.status, { date: longDate(condition.recordedOn) });
}

function ConditionItem({
  condition,
  editable,
  record,
}: {
  condition: ConditionView & { note?: string | null };
  editable: boolean;
  record: RecordCondition;
}) {
  const t = useTranslations('outcomes');
  const statusText = useConditionStatus();
  const id = useId();
  const [failing, setFailing] = useState(false);
  const [note, setNote] = useState(condition.note ?? '');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();
  const run = (input: Parameters<RecordCondition>[0]) =>
    startTransition(async () => {
      const result = await record(input).catch(() => ({ ok: false as const, code: 'not_found' }));
      if (result.ok) {
        setFailing(false);
        setFeedback('recorded');
      } else setFeedback(outcomeError(result.code));
    });

  return (
    <li className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-body-sm text-text">{condition.description}</span>
        <Badge variant={condition.status === 'failed' ? 'destructive' : 'outline'}>
          {statusText(condition)}
        </Badge>
      </div>
      {condition.note ? <p className="text-caption text-text-secondary">{condition.note}</p> : null}
      {editable ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run({ conditionId: condition.id, status: 'met' })}
          >
            {t('conditions.met')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setFailing(true)}
          >
            {t('conditions.failed')}
          </Button>
          {condition.status !== 'pending' ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run({ conditionId: condition.id, status: 'pending' })}
            >
              {t('conditions.reset')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {failing ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (note.trim() === '') {
              setFeedback('noteRequired');
              return;
            }
            run({ conditionId: condition.id, status: 'failed', note: note.trim() });
          }}
        >
          <Label htmlFor={`${id}-note`}>{t('conditions.note')}</Label>
          <Textarea
            id={`${id}-note`}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={pending} className="self-start">
            {t('conditions.save')}
          </Button>
        </form>
      ) : null}
      {feedback === 'recorded' ? (
        <FormMessage tone="success">{t('conditions.recorded')}</FormMessage>
      ) : feedback === 'noteRequired' ? (
        <FormMessage tone="danger">{t('conditions.noteRequired')}</FormMessage>
      ) : feedback ? (
        <FormMessage tone="danger">{t(`errors.${feedback}`)}</FormMessage>
      ) : null}
    </li>
  );
}

/** RF-121: the client conditions with their dated state; writers record them until decided. */
export function Conditions({
  outcomeId,
  conditions,
  editable,
  record,
  add,
}: {
  outcomeId: string;
  conditions: (ConditionView & { note?: string | null })[];
  editable: boolean;
  record: RecordCondition;
  add: AddCondition;
}) {
  const t = useTranslations('outcomes.conditions');
  const tErrors = useTranslations('outcomes.errors');
  const id = useId();
  const [description, setDescription] = useState('');
  const [feedback, setFeedback] = useState<'added' | OutcomeError | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col">
        {conditions.map((condition) => (
          <ConditionItem
            key={condition.id}
            condition={condition}
            editable={editable}
            record={record}
          />
        ))}
      </ul>
      {editable ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const result = await add({ outcomeId, description: description.trim() }).catch(
                () => ({ ok: false as const, code: 'not_found' }),
              );
              if (result.ok) {
                setDescription('');
                setFeedback('added');
              } else setFeedback(outcomeError(result.code));
            });
          }}
        >
          <div className="flex min-w-60 flex-1 flex-col gap-1">
            <Label htmlFor={`${id}-description`}>{t('addLabel')}</Label>
            <Input
              id={`${id}-description`}
              required
              maxLength={200}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            {t('add')}
          </Button>
          {feedback === 'added' ? (
            <FormMessage tone="success">{t('added')}</FormMessage>
          ) : feedback ? (
            <FormMessage tone="danger">{tErrors(feedback)}</FormMessage>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
