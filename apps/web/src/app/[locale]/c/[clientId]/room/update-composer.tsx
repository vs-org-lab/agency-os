'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import { AttachmentPicker } from '@/components/library/attachment-picker';
import type { AttachableFile } from '@/modules/library';
import { roomError, type ActionResult, type RoomError } from './room-errors';

export type PublishUpdate = (input: {
  projectId: string;
  body: string;
  milestone: string | null;
  visibility: 'internal' | 'client';
  fileIds: string[];
}) => Promise<ActionResult>;

const MAX_LENGTH = 5000;

/** C-02: writes an update, internal unless the author makes it visible (RN-50), with library files attached (RF-055). */
export function UpdateComposer({
  projectId,
  publish,
  attachable = [],
}: {
  projectId: string;
  publish: PublishUpdate;
  attachable?: readonly AttachableFile[];
}) {
  const t = useTranslations('rooms.updates');
  const te = useTranslations('rooms.errors');
  const router = useRouter();
  const [body, setBody] = useState('');
  const [milestone, setMilestone] = useState('');
  const [visibility, setVisibility] = useState<'internal' | 'client'>('internal');
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [result, setResult] = useState<
    { ok: true } | { ok: false; error: RoomError | 'attachment_hidden' } | null
  >(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      aria-label={t('composer')}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const outcome = await publish({
            projectId,
            body,
            milestone: milestone.trim() || null,
            visibility,
            fileIds,
          }).catch(() => ({ ok: false, code: 'not_found' }) as const);
          if (outcome.ok) {
            setBody('');
            setMilestone('');
            setVisibility('internal');
            setFileIds([]);
            setResult({ ok: true });
            router.refresh();
          } else {
            setResult({
              ok: false,
              error:
                outcome.code === 'attachment_hidden'
                  ? 'attachment_hidden'
                  : roomError(outcome.code),
            });
          }
        });
      }}
    >
      <h2 className="text-title-sm text-text">{t('composer')}</h2>
      <div className="flex flex-col gap-1">
        <Label htmlFor="update-body">{t('body')}</Label>
        <Textarea
          id="update-body"
          required
          rows={4}
          maxLength={MAX_LENGTH}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setResult(null);
          }}
        />
      </div>
      <div className="flex flex-col gap-1 md:w-80">
        <Label htmlFor="update-milestone">{t('milestone')}</Label>
        <Input
          id="update-milestone"
          maxLength={120}
          value={milestone}
          onChange={(event) => setMilestone(event.target.value)}
        />
      </div>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 text-label text-text">{t('visibility')}</legend>
        {(['internal', 'client'] as const).map((value) => (
          <label key={value} className="flex items-center gap-2 text-body-sm text-text">
            <input
              type="radio"
              name="update-visibility"
              className="size-4"
              value={value}
              checked={visibility === value}
              onChange={() => setVisibility(value)}
            />
            {t(value)}
          </label>
        ))}
      </fieldset>
      {attachable.length > 0 ? (
        <AttachmentPicker
          files={attachable}
          selected={fileIds}
          onChange={setFileIds}
          visibility={visibility}
        />
      ) : null}
      {result?.ok === false ? <FormMessage tone="danger">{te(result.error)}</FormMessage> : null}
      {result?.ok ? <FormMessage tone="success">{t('published')}</FormMessage> : null}
      <div className="md:w-48">
        <Button type="submit" disabled={pending} className="w-full">
          {t('publish')}
        </Button>
      </div>
    </form>
  );
}
