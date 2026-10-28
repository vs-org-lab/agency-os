'use client';

import { useLocale, useTranslations } from 'next-intl';
import { TimelineGantt } from '@agency-os/ui/components/timeline-gantt';
import type { TimelineRow } from '@/modules/rooms';

/** Read-only project timeline (UX-6): one bar per dated phase, with today marked. */
export function TimelineView({
  rows,
  undated,
  today,
}: {
  rows: readonly TimelineRow[];
  /** Names of the phases left out for lack of dates. */
  undated: readonly string[];
  today: string;
}) {
  const t = useTranslations('rooms.timeline');
  const locale = useLocale();

  return (
    <div className="flex flex-col gap-3">
      {rows.length > 0 ? (
        <TimelineGantt
          rows={rows}
          today={today}
          locale={locale}
          label={t('title')}
          todayLabel={t('today')}
          zoomLabel={t('zoom')}
          zoomWeekLabel={t('week')}
          zoomMonthLabel={t('month')}
          rowLabel={(row) => t('row', { name: row.label, start: row.start, end: row.end })}
        />
      ) : (
        <p className="text-body-sm text-text-secondary">{t('empty')}</p>
      )}
      {rows.length > 0 && undated.length > 0 ? (
        <p className="text-caption text-text-secondary">
          {t('undated', { names: undated.join(', ') })}
        </p>
      ) : null}
    </div>
  );
}
