import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { AgendaItem } from '@/modules/agenda';

function itemHref(item: AgendaItem): string {
  return item.href ?? `/calendar?view=week&date=${item.day}`;
}

/** S-01 "Próximos eventos": the next meetings and calls, then the deadlines of the coming week. */
export function UpcomingEvents({ items }: { items: AgendaItem[] }) {
  const t = useTranslations('studio.home.upcoming');
  const format = useFormatter();

  const label = (item: AgendaItem) => {
    if (item.kind === 'meeting') return item.title;
    if (item.kind === 'call') return t('call', { client: item.clientName ?? item.title });
    return t('deadline', { kind: t(`kinds.${item.kind}`), title: item.title });
  };

  const when = (item: AgendaItem) =>
    item.startsAt
      ? format.dateTime(new Date(item.startsAt), {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : format.dateTime(new Date(`${item.day}T12:00:00Z`), {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        });

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? (
        <p className="text-body-sm text-text-secondary">{t('empty')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <Link
                href={itemHref(item)}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-muted"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-body text-text">{label(item)}</span>
                  {item.clientName && item.kind !== 'call' ? (
                    <span className="truncate text-caption text-text-secondary">
                      {item.clientName}
                    </span>
                  ) : null}
                </span>
                <time
                  dateTime={item.startsAt ?? item.day}
                  className="shrink-0 text-caption text-text-secondary"
                >
                  {when(item)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/calendar" className="self-start text-body-sm text-link hover:underline">
        {t('viewCalendar')}
      </Link>
    </div>
  );
}
