'use client';

import { useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { cn } from '@agency-os/ui/lib/utils';
import { FormMessage } from '@/components/forms/form-message';
import type { HubEditorPage } from '@/modules/brand-hub';
import { hubError, type ActionResult, type HubError } from './hub-errors';

export type PageActions = {
  add: (hubId: string, title: string) => Promise<ActionResult>;
  rename: (pageId: string, title: string) => Promise<ActionResult>;
  setHidden: (pageId: string, hidden: boolean) => Promise<ActionResult>;
  move: (pageId: string, direction: 'up' | 'down') => Promise<ActionResult>;
  remove: (pageId: string) => Promise<ActionResult>;
};

/** The hub's pages in order: open one, rename it, hide it, move it, or remove a page of its own. */
export function PageNavigator({
  hubId,
  pages,
  selectedId,
  onSelect,
  actions,
  onChanged,
}: {
  hubId: string;
  pages: HubEditorPage[];
  selectedId: string | null;
  onSelect: (pageId: string) => void;
  actions: PageActions;
  onChanged: () => void;
}) {
  const t = useTranslations('brandHub');
  const [newTitle, setNewTitle] = useState('');
  const [error, setError] = useState<HubError | null>(null);
  const [pending, startTransition] = useTransition();
  const selected = pages.find((page) => page.id === selectedId) ?? null;
  const [title, setTitle] = useState(selected?.title ?? '');
  const [titleFor, setTitleFor] = useState(selected?.id ?? null);
  if (selected && titleFor !== selected.id) {
    setTitleFor(selected.id);
    setTitle(selected.title);
  }

  const run = (action: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const outcome = await action().catch(() => ({ ok: false, code: 'not_found' }) as const);
      setError(outcome.ok ? null : hubError(outcome.code));
      if (outcome.ok) {
        after?.();
        onChanged();
      }
    });

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-body-sm font-medium text-text">{t('pages.title')}</h2>
      <ol className="flex flex-col gap-1">
        {pages.map((page, index) => (
          <li key={page.id} className="flex items-center gap-1">
            <button
              type="button"
              aria-current={page.id === selectedId ? 'page' : undefined}
              onClick={() => onSelect(page.id)}
              className={cn(
                'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-body-sm text-text hover:bg-surface-muted',
                page.id === selectedId && 'bg-surface-muted font-medium',
                page.hidden && 'text-text-secondary',
              )}
            >
              <span className="truncate">{page.title}</span>
              {page.hidden ? (
                <span className="text-caption text-text-secondary">{t('pages.hidden')}</span>
              ) : null}
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('pages.up', { title: page.title })}
              disabled={pending || index === 0}
              onClick={() => run(() => actions.move(page.id, 'up'))}
            >
              <ArrowUp aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('pages.down', { title: page.title })}
              disabled={pending || index === pages.length - 1}
              onClick={() => run(() => actions.move(page.id, 'down'))}
            >
              <ArrowDown aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t(page.hidden ? 'pages.show' : 'pages.hide', { title: page.title })}
              disabled={pending}
              onClick={() => run(() => actions.setHidden(page.id, !page.hidden))}
            >
              {page.hidden ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
            </Button>
            {page.kind === 'custom' ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('pages.remove', { title: page.title })}
                disabled={pending}
                onClick={() => run(() => actions.remove(page.id))}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
      {selected ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => actions.rename(selected.id, title));
          }}
        >
          <Label htmlFor="hub-page-title">{t('pages.titleField')}</Label>
          <Input
            id="hub-page-title"
            value={title}
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={pending}
            className="self-start"
          >
            {t('pages.save')}
          </Button>
        </form>
      ) : null}
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () => actions.add(hubId, newTitle),
            () => setNewTitle(''),
          );
        }}
      >
        <Label htmlFor="hub-page-new">{t('pages.newTitle')}</Label>
        <Input
          id="hub-page-new"
          value={newTitle}
          maxLength={80}
          onChange={(event) => setNewTitle(event.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={pending || newTitle.trim() === ''}
          className="self-start"
        >
          {t('pages.add')}
        </Button>
      </form>
      {error ? <FormMessage tone="danger">{t(`errors.${error}`)}</FormMessage> : null}
    </div>
  );
}
