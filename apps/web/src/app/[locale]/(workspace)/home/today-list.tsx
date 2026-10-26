import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Link } from '@/i18n/navigation';
import type { HomeItem } from '@/modules/studio';

/** US-11: everything waiting on the reader, already ordered by urgency. */
export function TodayList({ items }: { items: HomeItem[] }) {
  const t = useTranslations('studio.today');
  const format = useFormatter();

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-0.5 rounded-lg border border-dashed border-border px-4 py-3">
        <p className="text-body-sm font-medium text-text">{t('empty.title')}</p>
        <p className="text-caption text-text-secondary">{t('empty.description')}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
      {items.map((item) => (
        <li key={`${item.kind}-${item.id}`}>
          <Link
            href={item.href}
            className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-muted"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-body font-medium text-text">
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
              <Badge variant="secondary" className="bg-danger-bg text-danger">
                {t('overdue')}
              </Badge>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
