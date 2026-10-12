const TIME_ZONE = 'Europe/Lisbon';
const DAY_MS = 24 * 60 * 60 * 1000;

const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const OFFSET_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  timeZoneName: 'longOffset',
});

/** The calendar day, `YYYY-MM-DD`, that an instant falls on in Lisbon. */
export function lisbonDay(date: Date): string {
  return DAY_FORMAT.format(date);
}

/** Lisbon's offset from UTC at an instant, in milliseconds. */
function offsetAt(instant: number): number {
  const name =
    OFFSET_FORMAT.formatToParts(new Date(instant)).find((part) => part.type === 'timeZoneName')
      ?.value ?? 'GMT';
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return (match[1] === '-' ? -minutes : minutes) * 60_000;
}

function utcDay(day: string): number {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, date);
}

function formatUtcDay(instant: number): string {
  return new Date(instant).toISOString().slice(0, 10);
}

export function addDays(day: string, amount: number): string {
  return formatUtcDay(utcDay(day) + amount * DAY_MS);
}

/** Midnight in Lisbon at the start of `day`, as an instant. */
function lisbonMidnight(day: string): Date {
  const wall = utcDay(day);
  const guess = wall - offsetAt(wall);
  return new Date(wall - offsetAt(guess));
}

/** The instants a Lisbon day starts and ends at; 23 or 25 hours on daylight saving changes. */
export function dayBounds(day: string): { start: Date; end: Date } {
  return { start: lisbonMidnight(day), end: lisbonMidnight(addDays(day, 1)) };
}

/** Monday of the week `day` belongs to. */
function mondayOf(day: string): string {
  const weekday = new Date(utcDay(day)).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

/** The seven days, Monday to Sunday, of the week `day` falls in. */
export function weekDays(day: string): string[] {
  const monday = mondayOf(day);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/** The weeks, Monday to Sunday, that cover a month given as `YYYY-MM`. */
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const last = formatUtcDay(Date.UTC(year, monthNumber, 0));
  const weeks: string[][] = [];
  for (let monday = mondayOf(first); monday <= last; monday = addDays(monday, 7)) {
    weeks.push(weekDays(monday));
  }
  return weeks;
}
