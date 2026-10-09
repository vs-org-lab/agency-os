'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import { roomError, type ActionResult, type RoomError } from './room-errors';

const FIELD = 'h-11 rounded-md border border-border bg-surface px-3 text-body text-text md:h-9';

/** "Novo projeto": the founder or the client's manager starts a project from a process template. */
export function NewProjectForm({
  clientId,
  templates,
  create,
}: {
  clientId: string;
  templates: ReadonlyArray<{ key: string; name: string }>;
  create: (input: { clientId: string; name: string; templateKey: string }) => Promise<ActionResult>;
}) {
  const t = useTranslations('rooms');
  const [name, setName] = useState('');
  const [templateKey, setTemplateKey] = useState(templates[0]?.key ?? '');
  const [result, setResult] = useState<{ ok: true } | { ok: false; error: RoomError } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-3 md:grid-cols-[1fr_16rem_auto] md:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const outcome = await create({ clientId, name, templateKey }).catch(
            () => ({ ok: false, code: 'not_found' }) as const,
          );
          if (outcome.ok) setName('');
          setResult(outcome.ok ? { ok: true } : { ok: false, error: roomError(outcome.code) });
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="new-project-name">{t('projectName')}</Label>
        <Input
          id="new-project-name"
          required
          maxLength={120}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setResult(null);
          }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="new-project-template">{t('template')}</Label>
        <select
          id="new-project-template"
          className={FIELD}
          value={templateKey}
          onChange={(event) => setTemplateKey(event.target.value)}
        >
          {templates.map((template) => (
            <option key={template.key} value={template.key}>
              {template.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {t('createProject')}
      </Button>
      <div className="md:col-span-3">
        {result?.ok === false ? (
          <FormMessage tone="danger">{t(`errors.${result.error}`)}</FormMessage>
        ) : null}
        {result?.ok ? <FormMessage tone="success">{t('done.created')}</FormMessage> : null}
      </div>
    </form>
  );
}
