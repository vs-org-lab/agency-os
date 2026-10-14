import { addDays, monthGrid, weekDays } from '@/modules/agenda';
import type { AgendaViewName } from './agenda-calendar';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const LIST_DAYS = 30;

/** The view, the anchor day and the Lisbon days a calendar page reads, from its search params. */
export function agendaPeriod(
  params: { view?: string; date?: string },
  today: string,
): { view: AgendaViewName; date: string; from: string; to: string } {
  const view: AgendaViewName =
    params.view === 'week' || params.view === 'list' ? params.view : 'month';
  const date = params.date && DAY.test(params.date) ? params.date : today;
  if (view === 'week') {
    const days = weekDays(date);
    return { view, date, from: days[0] ?? date, to: days[6] ?? date };
  }
  if (view === 'list') return { view, date, from: date, to: addDays(date, LIST_DAYS) };
  const weeks = monthGrid(date.slice(0, 7));
  return { view, date, from: weeks[0]?.[0] ?? date, to: weeks.at(-1)?.at(-1) ?? date };
}
