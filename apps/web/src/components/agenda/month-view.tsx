'use client';

import { Plus } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { cn } from '@agency-os/ui/lib/utils';
import { monthGrid, weekDays, type AgendaItem } from '@/modules/agenda';
import { ItemChip } from './item-chip';

const VISIBLE_PER_DAY = 3;

const noon = (day: string) => new Date(`${day}T12:00:00Z`);

/** The month as weeks of seven days, Monday first, with up to three items a day. */
export function MonthView({
  month,
  today,
  items,
  canSchedule,
  onDay,
  onItem,
}: {
  month: string;
  today: string;
  items: AgendaItem[];
  canSchedule: boolean;
  onDay: (day: string) => void;
  onItem: (item: AgendaItem) => void;
}) {
  const t = useTranslations('agenda');
  const format = useFormatter();
  const weeks = monthGrid(month);
  const byDay = new Map<string, AgendaItem[]>();
  for (const item of items) byDay.set(item.day, [...(byDay.get(item.day) ?? []), item]);
  const header = weekDays(weeks[0]?.[0] ?? `${month}-01`);

  return (
    <table role="grid" className="w-full table-fixed border-collapse">
      <thead>
        <tr>
          {header.map((day) => (
            <th
              key={day}
              role="columnheader"
              className="pb-2 text-left text-caption font-medium text-text-secondary"
            >
              {format.dateTime(noon(day), { weekday: 'short' })}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0]}>
            {week.map((day) => {
              const dayItems = byDay.get(day) ?? [];
              const label = format.dateTime(noon(day), {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              });
              return (
                <td
                  key={day}
                  role="gridcell"
                  aria-label={label}
                  className={cn(
                    'h-28 border border-border p-1.5 align-top',
                    !day.startsWith(month) && 'bg-surface-muted',
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={cn(
                        'inline-flex size-6 items-center justify-center rounded-full text-caption',
                        day === today
                          ? 'bg-primary text-primary-foreground'
                          : 'text-text-secondary',
                      )}
                    >
                      {Number(day.slice(8))}
                    </span>
                    {canSchedule ? (
                      <button
                        type="button"
                        aria-label={t('newOn', {
                          date: format.dateTime(noon(day), { day: 'numeric', month: 'long' }),
                        })}
                        onClick={() => onDay(day)}
                        className="rounded p-0.5 text-text-secondary hover:bg-surface-muted hover:text-text"
                      >
                        <Plus aria-hidden="true" className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                  <ul className="mt-1 flex flex-col gap-1">
                    {dayItems.slice(0, VISIBLE_PER_DAY).map((item) => (
                      <li key={`${item.kind}-${item.id}`}>
                        <ItemChip item={item} onItem={onItem} />
                      </li>
                    ))}
                  </ul>
                  {dayItems.length > VISIBLE_PER_DAY ? (
                    <p className="mt-1 text-caption text-text-secondary">
                      {t('more', { count: dayItems.length - VISIBLE_PER_DAY })}
                    </p>
                  ) : null}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
