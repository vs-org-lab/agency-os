'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { cn } from '@agency-os/ui/lib/utils';
import { FormMessage } from '@/components/forms/form-message';
import { useStripNewParam } from '@/components/ui/use-strip-new-param';
import { Link, useRouter } from '@/i18n/navigation';
import { addDays, weekDays, type AgendaItem } from '@/modules/agenda';
import { ListView } from './list-view';
import { MeetingDialog, type AgendaActions, type DialogTarget } from './meeting-dialog';
import { MonthView } from './month-view';
import { WeekView } from './week-view';

export type { AgendaActions } from './meeting-dialog';

export type AgendaViewName = 'month' | 'week' | 'list';

const VIEWS: AgendaViewName[] = ['month', 'week', 'list'];
const FILTERS = ['meeting', 'call', 'deadlines', 'delivery'] as const;
type Filter = (typeof FILTERS)[number];

function filterOf(item: AgendaItem): Filter {
  if (item.kind === 'meeting' || item.kind === 'call' || item.kind === 'delivery') return item.kind;
  return 'deadlines';
}

/** The first day of the period before or after the one shown. */
function shift(view: AgendaViewName, date: string, direction: -1 | 1): string {
  if (view === 'week') return addDays(date, 7 * direction);
  if (view === 'list') return addDays(date, 30 * direction);
  const [year, month] = date.split('-').map(Number) as [number, number];
  const target = new Date(Date.UTC(year, month - 1 + direction, 1));
  return target.toISOString().slice(0, 10);
}

/**
 * The calendar archetype (S-04 and the room's Agenda): month, week and list, today and the periods
 * around it, filters by kind, and Nova reunião from any day for whoever schedules.
 */
export function AgendaCalendar({
  view,
  date,
  today,
  basePath,
  items,
  busy,
  canSchedule,
  openNewRequested = false,
  clients,
  projects,
  fixedClientId,
  actions,
}: {
  view: AgendaViewName;
  date: string;
  today: string;
  basePath: string;
  items: AgendaItem[];
  busy: { start: string; end: string }[];
  canSchedule: boolean;
  /** `?new=1`: opens the new meeting dialog on arrival, only for readers who may schedule. */
  openNewRequested?: boolean;
  clients: { id: string; name: string }[];
  projects: { id: string; name: string; clientId: string }[];
  fixedClientId: string | null;
  actions: AgendaActions;
}) {
  const t = useTranslations('agenda');
  const format = useFormatter();
  const router = useRouter();
  const stripNewParam = useStripNewParam();
  const [hidden, setHidden] = useState<Set<Filter>>(new Set());
  const [target, setTarget] = useState<DialogTarget | null>(null);
  const [notice, setNotice] = useState<'scheduled' | 'updated' | 'cancelled' | null>(null);
  useEffect(() => {
    if (openNewRequested && canSchedule) setTarget({ mode: 'new', day: today });
  }, [openNewRequested, canSchedule, today]);

  const closeDialog = () => {
    setTarget(null);
    if (openNewRequested) stripNewParam();
  };
  const shown = items.filter((item) => !hidden.has(filterOf(item)));
  const href = (nextView: AgendaViewName, nextDate: string) =>
    `${basePath}?view=${nextView}&date=${nextDate}`;

  const openItem = (item: AgendaItem) => setTarget({ mode: 'edit', item });
  const openDay = (day: string) => {
    setNotice(null);
    setTarget({ mode: 'new', day });
  };
  const shortDay = (day: string) =>
    format.dateTime(new Date(`${day}T12:00:00Z`), { day: 'numeric', month: 'short' });
  const period =
    view === 'month'
      ? format.dateTime(new Date(`${date}T12:00:00Z`), { month: 'long', year: 'numeric' })
      : t('periodRange', {
          start: shortDay(view === 'week' ? (weekDays(date)[0] ?? date) : date),
          end: shortDay(view === 'week' ? (weekDays(date)[6] ?? date) : addDays(date, 30)),
        });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label={t('nav.label')} className="flex items-center gap-1">
          <Link
            href={href(view, shift(view, date, -1))}
            aria-label={t('nav.previous')}
            className="rounded-md p-1.5 text-text-secondary hover:bg-surface-muted hover:text-text"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Link>
          <Link
            href={href(view, today)}
            className="rounded-md border border-border px-3 py-1 text-body-sm text-text hover:bg-surface-muted"
          >
            {t('nav.today')}
          </Link>
          <Link
            href={href(view, shift(view, date, 1))}
            aria-label={t('nav.next')}
            className="rounded-md p-1.5 text-text-secondary hover:bg-surface-muted hover:text-text"
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        </nav>
        <p className="text-heading text-text first-letter:uppercase">{period}</p>
        <nav
          aria-label={t('views.label')}
          className="ms-auto flex rounded-md border border-border p-0.5"
        >
          {VIEWS.map((name) => (
            <Link
              key={name}
              href={href(name, date)}
              aria-current={view === name ? 'page' : undefined}
              className={cn(
                'rounded px-3 py-1 text-body-sm text-text-secondary hover:text-text',
                view === name && 'bg-surface-muted text-text',
              )}
            >
              {t(`views.${name}`)}
            </Link>
          ))}
        </nav>
      </div>
      <div role="group" aria-label={t('filters.label')} className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            aria-pressed={!hidden.has(filter)}
            onClick={() =>
              setHidden((current) => {
                const next = new Set(current);
                if (next.has(filter)) next.delete(filter);
                else next.add(filter);
                return next;
              })
            }
            className="rounded-full border border-border px-3 py-1 text-caption text-text-secondary aria-pressed:border-text aria-pressed:bg-surface-muted aria-pressed:text-text"
          >
            {t(`filters.${filter}`)}
          </button>
        ))}
      </div>
      {notice ? <FormMessage tone="success">{t(`dialog.${notice}`)}</FormMessage> : null}
      {view === 'month' ? (
        <MonthView
          month={date.slice(0, 7)}
          today={today}
          items={shown}
          canSchedule={canSchedule}
          onDay={openDay}
          onItem={openItem}
        />
      ) : view === 'week' ? (
        <WeekView
          days={weekDays(date)}
          today={today}
          items={shown}
          busy={busy}
          canSchedule={canSchedule}
          onDay={openDay}
          onItem={openItem}
        />
      ) : (
        <ListView items={shown} onItem={openItem} />
      )}
      {target ? (
        <MeetingDialog
          key={target.mode === 'edit' ? target.item.id : target.day}
          target={target}
          onClose={closeDialog}
          onDone={(done) => {
            closeDialog();
            setNotice(done);
            router.refresh();
          }}
          clients={clients}
          projects={projects}
          fixedClientId={fixedClientId}
          actions={actions}
        />
      ) : null}
    </div>
  );
}
