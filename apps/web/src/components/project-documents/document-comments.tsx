'use client';

import { useId, useState, useTransition } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import { useRouter } from '@/i18n/navigation';
import type { DocumentCommentView } from '@/modules/project-documents';
import { documentError, type ActionResult, type DocumentError } from './document-errors';

/** RF-034: the comments on a document; the team may mark one internal, which never leaves (RN-23). */
export function DocumentComments({
  comments,
  audience,
  add,
}: {
  comments: DocumentCommentView[];
  audience: 'staff' | 'portal';
  add: (input: { body: string; internal: boolean }) => Promise<ActionResult>;
}) {
  const t = useTranslations('projectDocuments.comments');
  const te = useTranslations('projectDocuments.errors');
  const format = useFormatter();
  const router = useRouter();
  const id = useId();
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [result, setResult] = useState<{ ok: true } | { ok: false; error: DocumentError } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3">
      <h2 id={`${id}-title`} className="text-title-sm text-text">
        {t('title')}
      </h2>
      {comments.length === 0 ? (
        <p className="text-body-sm text-text-secondary">{t('empty')}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-label text-text">{comment.authorName ?? ''}</span>
                {comment.byClient ? <Badge variant="secondary">{t('client')}</Badge> : null}
                {comment.internal ? <Badge variant="outline">{t('internalBadge')}</Badge> : null}
                <span className="text-caption text-text-tertiary">
                  {t('onVersion', { number: comment.versionNumber })}
                </span>
                <time dateTime={comment.createdAt} className="text-caption text-text-tertiary">
                  {format.dateTime(new Date(comment.createdAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </time>
              </div>
              <p className="whitespace-pre-line text-body-sm text-text">{comment.body}</p>
            </li>
          ))}
        </ol>
      )}
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const outcome = await add({ body, internal: audience === 'staff' && internal }).catch(
              () => ({ ok: false, code: 'not_found' }) as const,
            );
            if (outcome.ok) {
              setBody('');
              setInternal(false);
              setResult({ ok: true });
              router.refresh();
            } else {
              setResult({ ok: false, error: documentError(outcome.code) });
            }
          });
        }}
      >
        <Label htmlFor={`${id}-body`}>{t('body')}</Label>
        <Textarea
          id={`${id}-body`}
          required
          rows={3}
          maxLength={2000}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setResult(null);
          }}
        />
        {audience === 'staff' ? (
          <label className="flex items-center gap-2 text-body-sm text-text">
            <input
              type="checkbox"
              className="size-4"
              checked={internal}
              onChange={(event) => setInternal(event.target.checked)}
            />
            {t('internal')}
          </label>
        ) : null}
        <div aria-live="polite">
          {result?.ok ? <FormMessage tone="success">{t('sent')}</FormMessage> : null}
          {result?.ok === false ? (
            <FormMessage tone="danger">{te(result.error)}</FormMessage>
          ) : null}
        </div>
        <Button type="submit" size="sm" disabled={pending} className="self-start">
          {t('send')}
        </Button>
      </form>
    </section>
  );
}
