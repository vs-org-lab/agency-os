'use client';

import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import { proofError, type ProofActionResult, type ProofError } from './proof-errors';

/** The project's revision rounds (RF-073), between 1 and 20. */
export function RevisionLimitForm({
  projectId,
  limit,
  save,
}: {
  projectId: string;
  limit: number;
  save: (projectId: string, limit: number) => Promise<ProofActionResult>;
}) {
  const t = useTranslations('proofing');
  const id = useId();
  const [value, setValue] = useState(String(limit));
  const [outcome, setOutcome] = useState<{ ok: true } | { ok: false; error: ProofError } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
          setOutcome({ ok: false, error: 'invalid_input' });
          return;
        }
        startTransition(async () => {
          const result = await save(projectId, parsed).catch(
            () => ({ ok: false, code: 'not_found' }) as const,
          );
          setOutcome(result.ok ? { ok: true } : { ok: false, error: proofError(result.code) });
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-limit`}>{t('section.revisionLimit')}</Label>
        <Input
          id={`${id}-limit`}
          type="number"
          inputMode="numeric"
          className="w-24"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setOutcome(null);
          }}
        />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {t('section.saveLimit')}
      </Button>
      {outcome?.ok === false ? (
        <FormMessage tone="danger">{t(`errors.${outcome.error}`)}</FormMessage>
      ) : null}
      {outcome?.ok ? <FormMessage tone="success">{t('section.limitSaved')}</FormMessage> : null}
    </form>
  );
}
