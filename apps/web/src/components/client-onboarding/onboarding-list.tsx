'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { Check, KeyRound, Upload } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { cn } from '@agency-os/ui/lib/utils';
import { FormMessage } from '@/components/forms/form-message';
import {
  uploadFiles,
  type ActionResult,
  type StartUploads,
} from '@/components/library/upload-files';
import { useRouter } from '@/i18n/navigation';
import type { ClientOnboardingView, OnboardingItemView } from '@/modules/client-onboarding';

type Locale = 'pt-PT' | 'en';

export type OnboardingListActions = {
  respond: (requestId: string, response: string) => Promise<ActionResult>;
  folder: (
    requestId: string,
  ) => Promise<{ ok: true; folderId: string } | { ok: false; code: string }>;
  startUploads: StartUploads;
  finishUpload: (fileId: string) => Promise<ActionResult>;
};

type Feedback = { tone: 'success' | 'danger'; text: string } | null;

function errorKey(code: string): 'response_required' | 'invalid_file' | 'storage_full' | 'failed' {
  return code === 'response_required' || code === 'invalid_file' || code === 'storage_full'
    ? code
    : 'failed';
}

function OnboardingItem({
  item,
  position,
  canUpload,
  actions,
}: {
  item: OnboardingItemView;
  position: number;
  canUpload: boolean;
  actions: OnboardingListActions;
}) {
  const t = useTranslations('clientOnboarding');
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const router = useRouter();
  const id = useId();
  const files = useRef<HTMLInputElement>(null);
  const [response, setResponse] = useState(item.response);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { request } = item;

  const fail = (code: string) =>
    setFeedback({ tone: 'danger', text: t(`portal.errors.${errorKey(code)}`) });

  const respond = (value: string, success: string) =>
    startTransition(async () => {
      const result = await actions.respond(request.id, value).catch(() => ({
        ok: false as const,
        code: 'failed',
      }));
      if (!result.ok) return fail(result.code);
      setFeedback({ tone: 'success', text: success });
      router.refresh();
    });

  const send = (chosen: File[]) =>
    startTransition(async () => {
      if (chosen.length === 0) return;
      const folder = await actions
        .folder(request.id)
        .catch(() => ({ ok: false as const, code: 'failed' }));
      if (!folder.ok) return fail(folder.code);
      setProgress(t('portal.uploading'));
      const sent: string[] = [];
      const outcome = await uploadFiles(
        folder.folderId,
        chosen,
        { startUploads: actions.startUploads, finishUpload: actions.finishUpload },
        () => undefined,
        (file, status) => {
          if (status === 'done') sent.push(file.name);
        },
      );
      setProgress(null);
      if (files.current) files.current.value = '';
      if (sent.length === 0) return fail(outcome.error ?? 'invalid_file');
      const listed = [item.response, ...sent].filter(Boolean).join('\n');
      const result = await actions.respond(request.id, listed).catch(() => ({
        ok: false as const,
        code: 'failed',
      }));
      if (!result.ok) return fail(result.code);
      setFeedback(
        outcome.rejected > 0
          ? { tone: 'danger', text: t('portal.errors.invalid_file') }
          : { tone: 'success', text: t('portal.uploaded') },
      );
      router.refresh();
    });

  return (
    <li
      className={cn(
        'flex flex-col gap-4 rounded-lg border bg-surface p-5',
        item.done ? 'border-border' : 'border-border-strong',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-caption tabular-nums',
            item.done
              ? 'bg-success-bg text-success'
              : 'border border-border-strong text-text-secondary',
          )}
        >
          {item.done ? <Check className="size-3.5" /> : position}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-body font-semibold text-text">{request.title[locale]}</h2>
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-caption text-text-secondary">
              {t(`kinds.${request.kind}`)}
            </span>
          </div>
          <p className="max-w-[68ch] text-body-sm text-text-secondary">{request.body[locale]}</p>
          {item.done && item.completedAt ? (
            <p className="text-caption text-success">
              {t('portal.doneOn', {
                date: format.dateTime(new Date(item.completedAt), { dateStyle: 'medium' }),
              })}
              {item.respondedByName ? ` ${t('portal.doneBy', { name: item.respondedByName })}` : ''}
            </p>
          ) : null}
        </div>
      </div>

      {request.kind === 'upload' ? (
        canUpload ? (
          <div className="flex flex-wrap items-center gap-3 pl-9">
            <Label htmlFor={`${id}-files`} className="sr-only">
              {t('portal.files')}
            </Label>
            <input
              ref={files}
              id={`${id}-files`}
              type="file"
              multiple
              disabled={pending}
              className="sr-only"
              onChange={(event) => send([...(event.target.files ?? [])])}
            />
            <Button
              type="button"
              variant={item.done ? 'outline' : 'default'}
              size="sm"
              disabled={pending}
              onClick={() => files.current?.click()}
            >
              <Upload aria-hidden="true" />
              {progress ?? t('portal.files')}
            </Button>
            {item.response ? (
              <ul className="flex flex-col text-caption text-text-tertiary">
                {item.response.split('\n').map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="pl-9 text-body-sm text-text-tertiary">{t('portal.uploadWaits')}</p>
        )
      ) : request.kind === 'text' ? (
        <form
          className="flex flex-col gap-2 pl-9"
          onSubmit={(event) => {
            event.preventDefault();
            respond(response, t('portal.sent'));
          }}
        >
          <Label htmlFor={`${id}-answer`}>{t('portal.answerLabel')}</Label>
          <Textarea
            id={`${id}-answer`}
            rows={4}
            maxLength={4000}
            value={response}
            onChange={(event) => setResponse(event.target.value)}
          />
          <div>
            <Button type="submit" size="sm" disabled={pending}>
              {item.done ? t('portal.update') : t('portal.respond')}
            </Button>
          </div>
        </form>
      ) : item.done ? null : (
        <div className="flex flex-wrap items-center gap-3 pl-9">
          {request.kind === 'access' ? (
            <span className="flex items-center gap-1.5 text-caption text-text-tertiary">
              <KeyRound aria-hidden="true" className="size-3.5" />
              {t('portal.accessHint')}
            </span>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => respond('', t('portal.sent'))}
          >
            {t('portal.confirm')}
          </Button>
        </div>
      )}

      {feedback ? (
        <FormMessage tone={feedback.tone} className="ml-9">
          {feedback.text}
        </FormMessage>
      ) : null}
    </li>
  );
}

/** P-onboarding: what the agency needs from the client, open requests first. */
export function OnboardingList({
  view,
  actions,
}: {
  view: ClientOnboardingView;
  actions: OnboardingListActions;
}) {
  const t = useTranslations('clientOnboarding.portal');
  const done = view.items.filter((item) => item.done).length;
  const ordered = [
    ...view.items.filter((item) => !item.done),
    ...view.items.filter((item) => item.done),
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div
          role="progressbar"
          aria-label={t('progress', { done, total: view.items.length })}
          aria-valuemin={0}
          aria-valuemax={view.items.length}
          aria-valuenow={done}
          className="flex gap-1"
        >
          {view.items.map((item) => (
            <span
              key={item.request.id}
              className={cn('h-1.5 flex-1 rounded-full', item.done ? 'bg-success' : 'bg-border')}
            />
          ))}
        </div>
        <p className="text-caption text-text-secondary">
          {t('progress', { done, total: view.items.length })}
        </p>
      </div>
      <ol className="flex flex-col gap-3">
        {ordered.map((item, index) => (
          <OnboardingItem
            key={item.request.id}
            item={item}
            position={index + 1}
            canUpload={view.canUpload}
            actions={actions}
          />
        ))}
      </ol>
    </div>
  );
}
