'use client';

import { useActionState, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { DocumentStatus } from '@agency-os/db';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import { SubmitButton } from '@/components/forms/submit-button';
import { Link } from '@/i18n/navigation';
import { changeDocumentAction, saveDocumentAction } from './actions';

type PresentationView = { id: string; title: string; url: string; status: DocumentStatus };

function DocumentForm({
  dealId,
  document,
  onSaved,
}: {
  dealId: string;
  document?: PresentationView;
  onSaved?: () => void;
}) {
  const t = useTranslations('diagnosis.presentation');
  const [state, formAction] = useActionState(
    async (previous: Parameters<typeof saveDocumentAction>[2], formData: FormData) => {
      const result = await saveDocumentAction(dealId, document?.id ?? null, previous, formData);
      if (result.status === 'saved') onSaved?.();
      return result;
    },
    { status: 'idle' },
  );
  const prefix = document?.id ?? 'new-document';

  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-title`}>{t('name')}</Label>
        <Input
          id={`${prefix}-title`}
          name="title"
          required
          maxLength={200}
          defaultValue={document?.title ?? ''}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-url`}>{t('url')}</Label>
        <Input
          id={`${prefix}-url`}
          name="url"
          type="url"
          required
          defaultValue={document?.url ?? ''}
          aria-describedby={`${prefix}-hint`}
        />
      </div>
      <p id={`${prefix}-hint`} className="text-caption text-text-tertiary md:col-span-2">
        {t('publicHint')}
      </p>
      {state.status === 'error' ? (
        <div className="md:col-span-2">
          <FormMessage tone="danger">{t(`errors.${state.code}` as never)}</FormMessage>
        </div>
      ) : null}
      <div className="md:w-48">
        <SubmitButton>{t('save')}</SubmitButton>
      </div>
    </form>
  );
}

function PresentationItem({
  dealId,
  document,
  writable,
}: {
  dealId: string;
  document: PresentationView;
  writable: boolean;
}) {
  const t = useTranslations('diagnosis.presentation');
  const [replacing, setReplacing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const change = (kind: 'share' | 'withdraw' | 'remove') =>
    startTransition(async () => {
      const result = await changeDocumentAction(dealId, document.id, kind);
      setError(result.ok ? null : t('errors.not_found'));
      setConfirming(false);
    });

  return (
    <li className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-body font-medium text-text">{document.title}</span>
          <Badge
            className={
              document.status === 'with_client'
                ? 'bg-info-bg text-info'
                : 'bg-surface-muted text-text-secondary'
            }
          >
            {t(`status.${document.status}`)}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/pipeline/${dealId}/documents/${document.id}`}>{t('open')}</Link>
          </Button>
          {writable ? (
            <>
              {document.status === 'draft' ? (
                <Button type="button" size="sm" disabled={pending} onClick={() => change('share')}>
                  {t('share')}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => change('withdraw')}
                >
                  {t('withdraw')}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setReplacing((value) => !value)}
              >
                {t('replace')}
              </Button>
              {confirming ? (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => change('remove')}
                >
                  {t('confirmRemove')}
                </Button>
              ) : (
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>
                  {t('remove')}
                </Button>
              )}
            </>
          ) : null}
        </div>
      </div>
      {replacing ? (
        <DocumentForm dealId={dealId} document={document} onSaved={() => setReplacing(false)} />
      ) : null}
      {error ? <FormMessage tone="danger">{error}</FormMessage> : null}
    </li>
  );
}

export function PresentationSection({
  dealId,
  documents,
  writable,
}: {
  dealId: string;
  documents: PresentationView[];
  writable: boolean;
}) {
  const t = useTranslations('diagnosis.presentation');
  const [adding, setAdding] = useState(false);

  return (
    <section
      aria-labelledby="core-presentation-title"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <header className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id="core-presentation-title" className="text-title-sm text-text">
            {t('title')}
          </h2>
          <p className="text-body-sm text-text-secondary">{t('description')}</p>
        </div>
        {writable && !adding ? (
          <Button type="button" variant="outline" onClick={() => setAdding(true)}>
            {t('add')}
          </Button>
        ) : null}
      </header>
      {adding ? <DocumentForm dealId={dealId} onSaved={() => setAdding(false)} /> : null}
      {documents.length === 0 ? (
        <p className="text-body-sm text-text-tertiary">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {documents.map((document) => (
            <PresentationItem
              key={document.id}
              dealId={dealId}
              document={document}
              writable={writable}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
