'use client';

import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import { decimal, outcomeError, type OutcomeError, type OutcomeResult } from './shared';

export type RecordMeasurement = (input: {
  outcomeId: string;
  measuredOn: string;
  value: string;
  note: string;
}) => Promise<OutcomeResult>;

function todayInLisbon(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());
}

/** RF-122: the team records the metric's value on a date; the same date replaces it. */
export function MeasurementForm({
  outcomeId,
  record,
}: {
  outcomeId: string;
  record: RecordMeasurement;
}) {
  const t = useTranslations('outcomes');
  const id = useId();
  const [measuredOn, setMeasuredOn] = useState(todayInLisbon);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<'saved' | OutcomeError | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await record({
            outcomeId,
            measuredOn,
            value: decimal(value),
            note: note.trim(),
          }).catch(() => ({ ok: false as const, code: 'not_found' }));
          if (result.ok) {
            setValue('');
            setNote('');
            setMessage('saved');
          } else setMessage(outcomeError(result.code));
        });
      }}
    >
      <h4 className="text-body-sm font-medium text-text">{t('measurement.title')}</h4>
      <div className="grid gap-3 sm:grid-cols-[10rem_8rem_1fr]">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-date`}>{t('measurement.date')}</Label>
          <Input
            id={`${id}-date`}
            type="date"
            required
            max={todayInLisbon()}
            value={measuredOn}
            onChange={(event) => setMeasuredOn(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-value`}>{t('measurement.value')}</Label>
          <Input
            id={`${id}-value`}
            inputMode="decimal"
            required
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-note`}>{t('measurement.note')}</Label>
          <Input
            id={`${id}-note`}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </div>
      {message === 'saved' ? (
        <FormMessage tone="success">{t('measurement.saved')}</FormMessage>
      ) : message ? (
        <FormMessage tone="danger">{t(`errors.${message}`)}</FormMessage>
      ) : null}
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {t('measurement.save')}
      </Button>
    </form>
  );
}
