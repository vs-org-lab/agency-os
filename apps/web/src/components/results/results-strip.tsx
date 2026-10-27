import { ArrowUpRight } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { cn } from '@agency-os/ui/lib/utils';
import { Link } from '@/i18n/navigation';
import {
  formatKpi,
  kpiChange,
  kpiStanding,
  monthsUpTo,
  type KpiFormat,
  type KpiPoint,
} from '@/modules/results';
import { Sparkline } from './sparkline';

export type StripKpi = {
  id: string;
  name: string;
  format: KpiFormat;
  target: number | null;
  values: readonly KpiPoint[];
};

const CHANGE_TONE = {
  up: 'text-success',
  down: 'text-warning',
  flat: 'text-text-tertiary',
} as const;

const CHANGE_ARROW = { up: '▲', down: '▼', flat: '·' } as const;

/**
 * The client's first four indicators for the current month: value, change against the previous
 * month, a six-month line and where it stands against the target. Shared by the room and the
 * portal; the room passes `emptyHref` so an empty client invites the team to define indicators.
 */
export function ResultsStrip({
  kpis,
  currentMonth,
  href,
  emptyHref,
}: {
  kpis: readonly StripKpi[];
  currentMonth: string;
  href?: string;
  emptyHref?: string;
}) {
  const t = useTranslations('results');
  const format = useFormatter();
  const locale = useLocale();
  const months = monthsUpTo(currentMonth, 6);
  const previousMonth = months[months.length - 2] ?? currentMonth;
  const monthName = (month: string) =>
    format.dateTime(new Date(`${month}T12:00:00Z`), { month: 'long' });

  if (kpis.length === 0) {
    if (!emptyHref) return null;
    return (
      <section
        aria-labelledby="results-strip-title"
        className="rd-rise flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3.5"
      >
        <div className="flex flex-col gap-0.5">
          <h2 id="results-strip-title" className="text-body-sm font-semibold text-text">
            {t('title')}
          </h2>
          <p className="text-caption text-text-secondary">{t('strip.emptyTeam')}</p>
        </div>
        <Link
          href={emptyHref}
          className="inline-flex h-8 items-center rounded-md border border-border-strong px-3 text-body-sm font-medium text-text transition-colors duration-(--duration-fast) hover:bg-surface-muted"
        >
          {t('strip.emptyAction')}
        </Link>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="results-strip-title"
      className="rd-rise overflow-hidden rounded-lg border border-border bg-surface"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex flex-col">
          <h2 id="results-strip-title" className="text-body-sm font-semibold text-text">
            {t('strip.title', { month: monthName(currentMonth) })}
          </h2>
          <span className="text-caption text-text-tertiary">
            {t('strip.compared', { month: monthName(previousMonth) })}
          </span>
        </div>
        {href ? (
          <Link
            href={href}
            aria-label={t('strip.open')}
            className="flex size-7 items-center justify-center rounded-md text-text-tertiary transition-colors duration-(--duration-fast) hover:bg-surface-muted hover:text-text"
          >
            <ArrowUpRight aria-hidden className="size-4" />
          </Link>
        ) : null}
      </div>
      <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        {kpis.slice(0, 4).map((kpi) => {
          const byMonth = new Map(kpi.values.map((point) => [point.month, point.value]));
          const value = byMonth.get(currentMonth) ?? null;
          const previous = byMonth.get(previousMonth) ?? null;
          const change = value === null ? null : kpiChange(value, previous, kpi.format);
          const standing = value === null ? null : kpiStanding(value, kpi.target);
          const line = months
            .map((month) => byMonth.get(month))
            .filter((point): point is number => point !== undefined);
          const titleId = `kpi-${kpi.id}`;
          return (
            <div
              key={kpi.id}
              role="group"
              aria-labelledby={titleId}
              className="flex flex-col gap-2 px-4 py-4"
            >
              <span id={titleId} className="truncate text-caption font-medium text-text-tertiary">
                {kpi.name}
              </span>
              {value === null ? (
                <span className="text-body-sm text-text-tertiary">{t('strip.noValue')}</span>
              ) : (
                <span className="flex items-baseline gap-2">
                  <span className="text-display font-semibold tracking-[-0.02em] text-text tabular-nums">
                    {formatKpi(value, kpi.format, locale)}
                  </span>
                  {change ? (
                    <span
                      className={cn('text-caption tabular-nums', CHANGE_TONE[change.direction])}
                    >
                      <span aria-hidden>{CHANGE_ARROW[change.direction]} </span>
                      <span className="sr-only">
                        {change.direction === 'flat'
                          ? t('change.flat')
                          : t(`change.${change.direction}`, {
                              amount: t(`change.${change.unit}`, {
                                amount: format.number(change.amount),
                              }),
                            })}
                      </span>
                      <span aria-hidden>
                        {change.direction === 'flat'
                          ? ''
                          : t(`change.${change.unit}`, { amount: format.number(change.amount) })}
                      </span>
                    </span>
                  ) : null}
                </span>
              )}
              <Sparkline values={line} />
              {kpi.target !== null ? (
                <span className="text-caption text-text-tertiary">
                  {t('strip.target', { target: formatKpi(kpi.target, kpi.format, locale) })}
                  {standing
                    ? ` · ${standing.met ? t('strip.met') : t('strip.share', { share: Math.round(standing.share * 100) })}`
                    : ''}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
