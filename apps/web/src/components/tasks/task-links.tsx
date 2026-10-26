'use client';

import { useId, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { ExternalLink, Plus, X } from 'lucide-react';
import { notify } from '@/components/ui/notify';
import type { TaskDetail } from '@/modules/tasks';
import { taskError, type TaskActionResult } from './task-errors';
import { useTaskAction } from './use-task-action';

/** Only `https://` addresses are accepted, as on the server. */
function isHttpsUrl(value: string): boolean {
  if (!value.startsWith('https://')) return false;
  try {
    return new URL(value).hostname !== '';
  } catch {
    return false;
  }
}

function AddLink({
  taskId,
  addLink,
  onDone,
}: {
  taskId: string;
  addLink: (input: {
    taskId: string;
    url: string;
    title?: string | null;
  }) => Promise<TaskActionResult>;
  onDone: () => void;
}) {
  const t = useTranslations('tasks.panel.links');
  const te = useTranslations('tasks.errors');
  const tp = useTranslations('tasks.panel');
  const id = useId();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [sending, setSending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const address = url.trim();
    if (!isHttpsUrl(address)) {
      setInvalid(true);
      return;
    }
    setSending(true);
    const result = await addLink({ taskId, url: address, title: title.trim() || null }).catch(
      () => ({ ok: false, code: 'not_found' }) as const,
    );
    setSending(false);
    if (result.ok) {
      onDone();
    } else if (result.code === 'invalid_input') {
      setInvalid(true);
    } else {
      notify.error(te(taskError(result.code)));
    }
  };

  return (
    <form className="flex flex-col gap-2" onSubmit={submit} noValidate>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-url`}>{t('url')}</Label>
        <Input
          id={`${id}-url`}
          autoFocus
          inputMode="url"
          autoComplete="off"
          placeholder="https://"
          maxLength={2000}
          value={url}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onChange={(event) => {
            setUrl(event.target.value);
            setInvalid(false);
          }}
        />
        {invalid ? (
          <p id={`${id}-error`} className="text-caption text-danger">
            {t('invalid')}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-title`}>{t('linkTitle')}</Label>
        <Input
          id={`${id}-title`}
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={sending}>
          {t('submit')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {tp('cancel')}
        </Button>
      </div>
    </form>
  );
}

/** Links of the task, opened in a new tab; added with a field that validates next to itself. */
export function TaskLinks({
  taskId,
  links,
  addLink,
  removeLink,
}: {
  taskId: string;
  links: TaskDetail['links'];
  addLink: (input: {
    taskId: string;
    url: string;
    title?: string | null;
  }) => Promise<TaskActionResult>;
  removeLink: (linkId: string) => Promise<TaskActionResult>;
}) {
  const t = useTranslations('tasks.panel.links');
  const { run, pending } = useTaskAction();
  const [adding, setAdding] = useState(false);

  return (
    <section aria-labelledby="task-links-heading" className="flex flex-col gap-2">
      <h3 id="task-links-heading" className="text-label text-text">
        {t('heading')}
      </h3>
      {links.length === 0 ? <p className="text-body-sm text-text-secondary">{t('none')}</p> : null}
      {links.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {links.map((link) => {
            const name = link.title ?? link.url;
            return (
              <li key={link.id} className="flex items-center gap-2">
                <ExternalLink aria-hidden className="size-4 shrink-0 text-text-secondary" />
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-body-sm text-link hover:underline"
                >
                  {name}
                </a>
                {link.canRemove ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={pending}
                    aria-label={t('remove', { name })}
                    onClick={() => void run(() => removeLink(link.id))}
                  >
                    <X aria-hidden />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {adding ? (
        <AddLink taskId={taskId} addLink={addLink} onDone={() => setAdding(false)} />
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start text-text-secondary"
          onClick={() => setAdding(true)}
        >
          <Plus aria-hidden />
          {t('add')}
        </Button>
      )}
    </section>
  );
}
