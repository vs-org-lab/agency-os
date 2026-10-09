'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@agency-os/i18n';
import { Button } from '@agency-os/ui/components/button';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import { renderContract, SAMPLE_CONTRACT_VALUES, TEMPLATE_FIELDS } from '@/modules/contracts';
import type { PublishContractTemplateResult } from '@/modules/contracts/server';

type Outcome =
  | { kind: 'idle' }
  | { kind: 'published'; version: number }
  | { kind: 'unknown'; fields: string[] }
  | { kind: 'invalid' };

/** A controlled editor: a refused publication never discards the edited contract text. */
function fieldToken(field: string): string {
  return `{{${field}}}`;
}

export function ContractTemplateEditor({
  locale,
  version,
  body,
  publish,
}: {
  locale: Locale;
  version: number;
  body: string;
  publish: (body: string) => Promise<PublishContractTemplateResult>;
}) {
  const t = useTranslations('settings.contractTemplates');
  const [value, setValue] = useState(body);
  const [preview, setPreview] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [pending, startTransition] = useTransition();
  const id = `contract-template-${locale}`;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await publish(value).catch(
            () => ({ ok: false, rule: 'invalid_input' }) as const,
          );
          if (result.ok) setOutcome({ kind: 'published', version: result.version });
          else if (result.rule === 'invalid_template') {
            setOutcome({ kind: 'unknown', fields: result.unknown });
          } else setOutcome({ kind: 'invalid' });
        });
      }}
    >
      <p className="text-caption text-text-secondary">{t('current', { version })}</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>{t('body')}</Label>
        <Textarea
          id={id}
          rows={18}
          value={value}
          maxLength={100_000}
          className="font-mono text-body-sm"
          onChange={(event) => {
            setValue(event.target.value);
            setOutcome({ kind: 'idle' });
          }}
        />
      </div>
      <details className="text-body-sm text-text-secondary">
        <summary className="cursor-pointer">{t('fields')}</summary>
        <ul className="flex flex-wrap gap-2 pt-2">
          {TEMPLATE_FIELDS.map((field) => (
            <li key={field}>
              <code className="rounded bg-surface-muted px-1.5 py-0.5 text-caption text-text">
                {fieldToken(field)}
              </code>
            </li>
          ))}
        </ul>
      </details>
      {outcome.kind === 'unknown' ? (
        <FormMessage tone="danger">
          {t('errors.unknown', { fields: outcome.fields.join(', ') })}
        </FormMessage>
      ) : null}
      {outcome.kind === 'invalid' ? (
        <FormMessage tone="danger">{t('errors.invalid')}</FormMessage>
      ) : null}
      {outcome.kind === 'published' ? (
        <FormMessage tone="success">{t('published', { version: outcome.version })}</FormMessage>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {t('publish')}
        </Button>
        <Button type="button" variant="outline" onClick={() => setPreview((shown) => !shown)}>
          {preview ? t('hidePreview') : t('preview')}
        </Button>
      </div>
      {preview ? (
        <div
          aria-label={t('previewLabel')}
          className="max-h-120 overflow-y-auto rounded-md border border-border bg-surface p-4 text-body-sm whitespace-pre-wrap text-text"
        >
          {renderContract(value, SAMPLE_CONTRACT_VALUES, locale)}
        </div>
      ) : null}
    </form>
  );
}
