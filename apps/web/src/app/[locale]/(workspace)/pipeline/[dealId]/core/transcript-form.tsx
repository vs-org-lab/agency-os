'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import type { CoreFormState } from './actions';

/**
 * A controlled transcript field: a failed save never discards a long paste. A newer server value
 * replaces an untouched field; a section appended by a transcribed recording is added to unsaved
 * edits; any other change blocks saving, so a save never drops text written elsewhere.
 */
export function TranscriptForm({
  id,
  initialValue,
  save,
  rows = 6,
}: {
  id: string;
  initialValue: string;
  save: (transcript: string) => Promise<CoreFormState>;
  rows?: number;
}) {
  const t = useTranslations('diagnosis.briefing');
  const [value, setValue] = useState(initialValue);
  const [baseline, setBaseline] = useState(initialValue);
  const [outdated, setOutdated] = useState(false);
  const [result, setResult] = useState<CoreFormState>({ status: 'idle' });
  const [pending, startTransition] = useTransition();

  if (initialValue !== baseline) {
    setBaseline(initialValue);
    if (value === baseline || value === initialValue) {
      setValue(initialValue);
      setOutdated(false);
    } else if (!outdated && initialValue.startsWith(baseline)) {
      setValue(value + initialValue.slice(baseline.length));
    } else {
      setOutdated(true);
    }
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          setResult(
            await save(value).catch(() => ({ status: 'error', code: 'not_found' }) as const),
          );
        });
      }}
    >
      <Label htmlFor={id}>{t('transcript')}</Label>
      <Textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={200_000}
        onChange={(event) => {
          setValue(event.target.value);
          setResult({ status: 'idle' });
        }}
      />
      {outdated ? <FormMessage tone="warning">{t('transcriptUpdated')}</FormMessage> : null}
      {result.status === 'error' ? (
        <FormMessage tone="danger">{t('transcriptFailed')}</FormMessage>
      ) : null}
      {result.status === 'saved' ? <FormMessage tone="success">{t('saved')}</FormMessage> : null}
      <div className="md:w-56">
        <Button type="submit" disabled={pending || outdated} className="w-full">
          {t('saveTranscript')}
        </Button>
      </div>
    </form>
  );
}
