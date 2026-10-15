'use client';

import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import type { StaffOutcomeView } from '@/modules/outcomes';
import { decimal, outcomeError, SELECT, type OutcomeError, type OutcomeResult } from './shared';

export type SaveOutcome = (input: {
  clientId: string;
  projectId: string;
  metric: string;
  unit: string;
  baseline: string;
  target: string;
  deadline: string;
  dataSource: string;
}) => Promise<OutcomeResult>;

/** RF-120: the agreed metric, baseline, target, deadline and data source of one project. */
export function OutcomeForm({
  clientId,
  view,
  save,
  onDone,
}: {
  clientId: string;
  view: StaffOutcomeView;
  save: SaveOutcome;
  onDone: () => void;
}) {
  const t = useTranslations('outcomes');
  const id = useId();
  const outcome = view.outcome;
  const locked = outcome !== null && outcome.guarantee.status !== 'pending';
  const [fields, setFields] = useState({
    projectId: outcome?.projectId ?? view.projects[0]?.id ?? '',
    metric: outcome?.metric ?? '',
    unit: outcome?.unit ?? '',
    baseline: outcome ? String(outcome.baseline) : '',
    target: outcome ? String(outcome.target) : '',
    deadline: outcome?.deadline ?? '',
    dataSource: outcome?.dataSource ?? '',
  });
  const [message, setMessage] = useState<'saved' | OutcomeError | null>(null);
  const [pending, startTransition] = useTransition();
  const field = (name: string) => `${id}-${name}`;
  const set = (name: keyof typeof fields) => (value: string) =>
    setFields((current) => ({ ...current, [name]: value }));
  const text = (
    name: Exclude<keyof typeof fields, 'projectId'>,
    options: { type?: string; inputMode?: 'decimal'; disabled?: boolean; maxLength?: number } = {},
  ) => (
    <div className="flex flex-col gap-1">
      <Label htmlFor={field(name)}>{t(`form.${name}`)}</Label>
      <Input
        id={field(name)}
        required={name !== 'unit'}
        type={options.type ?? 'text'}
        inputMode={options.inputMode}
        maxLength={options.maxLength}
        disabled={options.disabled}
        value={fields[name]}
        onChange={(event) => set(name)(event.target.value)}
      />
    </div>
  );

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await save({
            clientId,
            ...fields,
            metric: fields.metric.trim(),
            unit: fields.unit.trim(),
            baseline: decimal(fields.baseline),
            target: decimal(fields.target),
            dataSource: fields.dataSource.trim(),
          }).catch(() => ({ ok: false as const, code: 'not_found' }));
          if (result.ok) {
            setMessage('saved');
            onDone();
          } else setMessage(outcomeError(result.code));
        });
      }}
    >
      {locked ? <FormMessage tone="info">{t('form.locked')}</FormMessage> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {view.projects.length > 1 && !outcome ? (
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label htmlFor={field('project')}>{t('form.project')}</Label>
            <select
              id={field('project')}
              value={fields.projectId}
              onChange={(event) => set('projectId')(event.target.value)}
              className={SELECT}
            >
              {view.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {text('metric', { disabled: locked, maxLength: 80 })}
        {text('unit', { maxLength: 20 })}
        {text('baseline', { inputMode: 'decimal', disabled: locked })}
        {text('target', { inputMode: 'decimal', disabled: locked })}
        {text('deadline', { type: 'date', disabled: locked })}
        {text('dataSource', { maxLength: 120 })}
      </div>
      {message === 'saved' ? (
        <FormMessage tone="success">{t('form.saved')}</FormMessage>
      ) : message ? (
        <FormMessage tone="danger">{t(`errors.${message}`)}</FormMessage>
      ) : null}
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {t('form.save')}
      </Button>
    </form>
  );
}
