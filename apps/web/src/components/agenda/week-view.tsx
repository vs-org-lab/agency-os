'use client';

import { Plus } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { cn } from '@agency-os/ui/lib/utils';
import { lisbonDay, lisbonTime, type AgendaItem } from '@/modules/agenda';
import { ItemChip } from './item-chip';

const noon = (day: string) => new Date(`${day}T12:00:00Z`);

/**
 * Seven days side by side: the day's deadlines first, then meetings and calls by time, with the
 * host's busy blocks shown as "Ocupado" and nothing more.
 */
export function WeekView({
  days,
  today,
  items,
  busy,
  canSchedule,
  onDay,
  onItem,
}: {
  days: string[];
  today: string;
  items: AgendaItem[];
  busy: { start: string; end: string }[];
  canSchedule: boolean;
  onDay: (day: string) => void;
  onItem: (item: AgendaItem) => void;
}) {
  const t = useTranslations('agenda');
  const format = useFormatter();

  return (
    <div className="overflow-x-auto">
      <table role="grid" className="w-full min-w-[56rem] table-fixed border-collapse">
        <thead>
          <tr>
            {days.map((day) => (
              <th
                key={day}
                role="columnheader"
                className={cn(
                  'border-b border-border pb-2 text-left text-body-sm font-medium',
                  day === today ? 'text-text' : 'text-text-secondary',
                )}
              >
                {format.dateTime(noon(day), { weekday: 'short', day: 'numeric' })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {days.map((day) => {
              const dayItems = items.filter((item) => item.day === day);
              const blocks = busy.filter((block) => lisbonDay(new Date(block.start)) === day);
              return (
                <td key={day} className="border border-border p-1.5 align-top">
                  <ul className="flex min-h-48 flex-col gap-1">
                    {dayItems.map((item) => (
                      <li key={`${item.kind}-${item.id}`}>
                        <ItemChip item={item} onItem={onItem} />
                      </li>
                    ))}
                    {blocks.map((block) => (
                      <li
                        key={block.start}
                        className="rounded-md border border-dashed border-border-strong px-2 py-1 text-caption text-text-secondary"
                      >
                        {t('busyRange', {
                          start: lisbonTime(new Date(block.start)),
                          end: lisbonTime(new Date(block.end)),
                        })}
                      </li>
                    ))}
                  </ul>
                  {canSchedule ? (
                    <button
                      type="button"
                      aria-label={t('newOn', {
                        date: format.dateTime(noon(day), { day: 'numeric', month: 'long' }),
                      })}
                      onClick={() => onDay(day)}
                      className="mt-1 inline-flex rounded p-0.5 text-text-secondary hover:bg-surface-muted hover:text-text"
                    >
                      <Plus aria-hidden="true" className="size-3.5" />
                    </button>
                  ) : null}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
