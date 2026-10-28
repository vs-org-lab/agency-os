import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { AgendaItem } from '@/modules/agenda';
import { HomePanel } from './home-panel';

type Group = 'today' | 'tomorrow' | 'week' | 'later';

const DAY_MS = 24 * 60 * 60 * 1000;

function itemHref(item: AgendaItem): string {
  return item.href ?? `/calendar?view=week&date=${item.day}`;
}

function groupOf(day: string, today: string): Group {
  const diff = Math.round(
    (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS,
  );
  if (diff <= 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff < 7) return 'week';
  return 'later';
}

/** S-01 "Próximos eventos": meetings, calls and deadlines, grouped by how soon they come. */
export function UpcomingEvents({ items, today }: { items: AgendaItem[]; today?: string }) {
  const t = useTranslations('studio.home.upcoming');
  const format = useFormatter();

  const label = (item: AgendaItem) => {
    if (item.kind === 'meeting') return item.title;
    if (item.kind === 'call') return t('call', { client: item.clientName ?? item.title });
    return t('deadline', { kind: t(`kinds.${item.kind}`), title: item.title });
  };

  const dayDate = (item: AgendaItem) => new Date(`${item.day}T12:00:00Z`);
  const time = (item: AgendaItem) =>
    item.startsAt
      ? format.dateTime(new Date(item.startsAt), { hour: '2-digit', minute: '2-digit' })
      : null;

  const groups = new Map<Group, AgendaItem[]>();
  for (const item of items) {
    const key = today ? groupOf(item.day, today) : 'later';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return (
    <HomePanel
      id="home-upcoming"
      title={t('title')}
      action={{ href: '/calendar', label: t('viewCalendar') }}
      style={{ animationDelay: '80ms' }}
    >
      {items.length === 0 ? (
        <p className="px-1 py-2 text-body-sm text-text-secondary">{t('empty')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {[...groups.entries()].map(([group, entries]) => (
            <div
              key={group}
              role="group"
              aria-label={today ? t(`groups.${group}`) : undefined}
              className="flex flex-col gap-0.5"
            >
              {today ? (
                <span aria-hidden className="px-1 pb-1 text-caption font-medium text-text-tertiary">
                  {t(`groups.${group}`)}
                </span>
              ) : null}
              <ul className="flex flex-col">
                {entries.map((item) => (
                  <li key={`${item.kind}-${item.id}`}>
                    <Link
                      href={itemHref(item)}
                      className="flex items-center gap-3 rounded-md px-1 py-1.5 transition-colors duration-(--duration-fast) hover:bg-surface-muted"
                    >
                      <time
                        dateTime={item.day}
                        className="flex w-9 shrink-0 flex-col items-center rounded-md border border-border-strong py-0.5"
                      >
                        <span className="text-body-sm font-semibold text-text tabular-nums">
                          {format.dateTime(dayDate(item), { day: 'numeric' })}
                        </span>
                        <span className="text-[10px] leading-3 text-text-tertiary uppercase">
                          {format.dateTime(dayDate(item), { weekday: 'short' }).replace('.', '')}
                        </span>
                      </time>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-body-sm font-medium text-text">
                          {label(item)}
                        </span>
                        {item.clientName && item.kind !== 'call' ? (
                          <span className="truncate text-caption text-text-secondary">
                            {item.clientName}
                          </span>
                        ) : null}
                      </span>
                      {time(item) ? (
                        <span className="shrink-0 text-caption text-text-tertiary tabular-nums">
                          {time(item)}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </HomePanel>
  );
}
