'use client';

import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import { useRouter } from '@/i18n/navigation';
import type { DocumentActions } from '@/modules/project-documents';
import { documentError, type ActionResult, type DocumentError } from './document-errors';

export type DocumentHandlers = {
  share: () => Promise<ActionResult>;
  withdraw: () => Promise<ActionResult>;
  requestApproval: () => Promise<ActionResult>;
  remove: () => Promise<ActionResult>;
  changeLink: (url: string) => Promise<ActionResult>;
  replaceFile: (file: File) => Promise<ActionResult>;
};

type Done = 'share' | 'withdraw' | 'requestApproval' | 'version';

/** C-05: Partilhar, Retirar para rascunho, Pedir aprovação, Substituir, Mudar link and Remover (RF-033). */
export function DocumentActionsBar({
  documentId,
  kind,
  actions,
  canWrite,
  handlers,
  onRemoved,
}: {
  documentId: string;
  kind: 'figma' | 'pdf' | 'file' | 'link';
  actions: DocumentActions;
  canWrite: boolean;
  handlers: DocumentHandlers;
  onRemoved?: () => void;
}) {
  const t = useTranslations('projectDocuments.actions');
  const te = useTranslations('projectDocuments.errors');
  const router = useRouter();
  const id = useId();
  const [outcome, setOutcome] = useState<
    { ok: true; done: Done } | { ok: false; error: DocumentError } | null
  >(null);
  const [editingLink, setEditingLink] = useState(false);
  const [link, setLink] = useState('');
  const [pending, startTransition] = useTransition();
  if (!canWrite) return null;

  const run = (done: Done, action: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const result = await action().catch(() => ({ ok: false, code: 'not_found' }) as const);
      setOutcome(result.ok ? { ok: true, done } : { ok: false, error: documentError(result.code) });
      if (result.ok) {
        after?.();
        router.refresh();
      }
    });
  const linkKind = kind === 'figma' || kind === 'link';

  return (
    <div className="flex flex-col gap-3" data-document={documentId}>
      <div className="flex flex-wrap items-center gap-2">
        {actions.share ? (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => run('share', handlers.share)}
          >
            {t('share')}
          </Button>
        ) : null}
        {actions.requestApproval ? (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => run('requestApproval', handlers.requestApproval)}
          >
            {t('requestApproval')}
          </Button>
        ) : null}
        {actions.withdraw ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run('withdraw', handlers.withdraw)}
          >
            {t('withdraw')}
          </Button>
        ) : null}
        {linkKind ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setEditingLink(true)}>
            {t('changeLink')}
          </Button>
        ) : (
          <label
            htmlFor={`${id}-replace`}
            className="inline-flex h-8 cursor-pointer items-center rounded-md border border-border px-3 text-body-sm text-text focus-within:outline-2 hover:border-text"
          >
            {t('replace')}
            <input
              id={`${id}-replace`}
              type="file"
              className="sr-only"
              accept={kind === 'pdf' ? 'application/pdf' : undefined}
              disabled={pending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) run('version', () => handlers.replaceFile(file));
              }}
            />
          </label>
        )}
        {actions.remove ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(t('confirmRemove'))) return;
              startTransition(async () => {
                const result = await handlers
                  .remove()
                  .catch(() => ({ ok: false, code: 'not_found' }) as const);
                if (result.ok) onRemoved?.();
                else setOutcome({ ok: false, error: documentError(result.code) });
              });
            }}
          >
            {t('remove')}
          </Button>
        ) : null}
      </div>
      {editingLink ? (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            run(
              'version',
              () => handlers.changeLink(link),
              () => {
                setEditingLink(false);
                setLink('');
              },
            );
          }}
        >
          <div className="flex flex-col gap-1 sm:w-96">
            <Label htmlFor={`${id}-link`}>{t('newLink')}</Label>
            <Input
              id={`${id}-link`}
              type="url"
              required
              value={link}
              onChange={(event) => setLink(event.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {t('save')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditingLink(false)}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      ) : null}
      <div aria-live="polite">
        {outcome?.ok ? <FormMessage tone="success">{t(`done.${outcome.done}`)}</FormMessage> : null}
        {outcome?.ok === false ? (
          <FormMessage tone="danger">{te(outcome.error)}</FormMessage>
        ) : null}
      </div>
    </div>
  );
}
