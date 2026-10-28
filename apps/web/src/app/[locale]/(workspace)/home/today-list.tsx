import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { HomeItem } from '@/modules/studio';

/** US-11: everything waiting on the reader, already ordered by urgency. */
export function TodayList({ items }: { items: HomeItem[] }) {
  const t = useTranslations('studio.today');
  const format = useFormatter();

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-0.5 rounded-md bg-surface-muted px-3 py-3">
        <p className="text-body-sm font-medium text-text">{t('empty.title')}</p>
        <p className="text-caption text-text-secondary">{t('empty.description')}</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => (
        <li key={`${item.kind}-${item.id}`}>
          <Link
            href={item.href}
            className={`flex items-center justify-between gap-4 rounded-md border-l-2 bg-surface-muted px-3 py-2.5 transition-colors duration-(--duration-fast) hover:bg-border/40 ${
              item.overdue ? 'border-danger' : 'border-warning'
            }`}
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-body-sm font-medium text-text">
                {t(`kinds.${item.kind}`, {
                  title: item.title,
                  day: item.sequenceDay ?? 0,
                  time: format.dateTime(item.dueAt, { hour: '2-digit', minute: '2-digit' }),
                })}
              </span>
              {item.clientName ? (
                <span className="truncate text-caption text-text-secondary">{item.clientName}</span>
              ) : null}
            </span>
            {item.overdue ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-danger-bg px-2 py-0.5 text-caption font-medium text-danger">
                <span aria-hidden className="size-1.5 rounded-full bg-danger" />
                {t('overdue')}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
