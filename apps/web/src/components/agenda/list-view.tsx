'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import type { AgendaItem } from '@/modules/agenda';
import { ItemChip } from './item-chip';

/** The coming days as a list, one heading per day that has something on it. */
export function ListView({
  items,
  onItem,
}: {
  items: AgendaItem[];
  onItem: (item: AgendaItem) => void;
}) {
  const t = useTranslations('agenda');
  const format = useFormatter();
  if (items.length === 0) {
    return <EmptyState title={t('empty.title')} description={t('empty.description')} />;
  }
  const days = [...new Set(items.map((item) => item.day))];

  return (
    <div className="flex flex-col gap-6">
      {days.map((day) => (
        <section key={day} aria-labelledby={`agenda-day-${day}`} className="flex flex-col gap-2">
          <h3 id={`agenda-day-${day}`} className="text-body-sm font-medium text-text">
            {format.dateTime(new Date(`${day}T12:00:00Z`), {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </h3>
          <ul className="flex flex-col gap-1">
            {items
              .filter((item) => item.day === day)
              .map((item) => (
                <li key={`${item.kind}-${item.id}`} className="flex items-center gap-3">
                  <ItemChip item={item} onItem={onItem} className="text-body-sm" />
                  {item.clientName ? (
                    <span className="shrink-0 text-caption text-text-secondary">
                      {item.clientName}
                    </span>
                  ) : null}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
