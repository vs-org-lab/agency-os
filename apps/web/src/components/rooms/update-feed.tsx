'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import type { ClientUpdateView, UpdateView } from '@/modules/rooms';

/** The project feed; system entries read from their kind so both languages read correctly. */
export function UpdateFeed({ updates }: { updates: ReadonlyArray<ClientUpdateView | UpdateView> }) {
  const t = useTranslations('rooms.updates');
  const format = useFormatter();

  if (updates.length === 0) {
    return <p className="text-body-sm text-text-secondary">{t('empty')}</p>;
  }

  return (
    <ol className="flex flex-col gap-3">
      {updates.map((update) => {
        const internal = 'visibility' in update && update.visibility === 'internal';
        return (
          <li
            key={update.id}
            className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-label text-text">{update.authorName ?? t('system')}</span>
              <time dateTime={update.createdAt} className="text-caption text-text-tertiary">
                {format.dateTime(new Date(update.createdAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </time>
              {update.milestone ? <Badge variant="secondary">{update.milestone}</Badge> : null}
              {internal ? <Badge variant="outline">{t('internalBadge')}</Badge> : null}
            </div>
            <p className="whitespace-pre-line text-body text-text">
              {update.kind === 'manual'
                ? update.body
                : t(`kinds.${update.kind}`, { name: update.body })}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
