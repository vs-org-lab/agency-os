'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { lisbonMonth, type ClientRetainerRequest } from '@/modules/retainers';

const COLUMNS = ['received', 'in_progress', 'done'] as const;

/** A finished request stays on the board only during the Lisbon month it was finished in. */
function visible(request: ClientRetainerRequest, month: string): boolean {
  if (request.state !== 'done') return true;
  return request.completedAt !== null && lisbonMonth(new Date(request.completedAt)) === month;
}

export function RequestBoard({
  requests,
  month,
}: {
  requests: ClientRetainerRequest[];
  month: string;
}) {
  const t = useTranslations('portal.dashboard.board');
  const format = useFormatter();
  const shown = requests.filter((request) => visible(request, month));

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {COLUMNS.map((state) => {
        const column = shown.filter((request) => request.state === state);
        const headingId = `board-${state}`;
        return (
          <section
            key={state}
            aria-labelledby={headingId}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface-muted p-3"
          >
            <h3
              id={headingId}
              className="flex items-center justify-between text-body-sm font-medium text-text"
            >
              <span>{t(`columns.${state}`)}</span>
              <span className="text-caption text-text-secondary">{column.length}</span>
            </h3>
            {column.length === 0 ? (
              <p className="text-caption text-text-tertiary">{t(`emptyColumn.${state}`)}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {column.map((request) => (
                  <li
                    key={request.id}
                    className="flex flex-col gap-1 rounded-md border border-border bg-surface p-3"
                  >
                    <span className="text-body-sm text-text">{request.description}</span>
                    <span className="text-caption text-text-tertiary">
                      {t('requestedOn', {
                        date: format.dateTime(new Date(request.createdAt), { dateStyle: 'medium' }),
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
