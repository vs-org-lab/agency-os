import { TZDate } from '@date-fns/tz';
import type { WeeklyHours } from '@agency-os/db';

export type Weekday = keyof WeeklyHours;

export type BookingRules = {
  timeZone: string;
  weeklyHours: WeeklyHours;
  durationMinutes: number;
  bufferMinutes: number;
  minimumNoticeHours: number;
  horizonDays: number;
  stepMinutes: number;
};

export type Interval = { start: Date; end: Date };

const WORKING_DAY = [{ start: '10:00', end: '18:00' }];

export const DEFAULT_BOOKING_RULES: BookingRules = {
  timeZone: 'Europe/Lisbon',
  weeklyHours: {
    mon: WORKING_DAY,
    tue: WORKING_DAY,
    wed: WORKING_DAY,
    thu: WORKING_DAY,
    fri: WORKING_DAY,
    sat: [],
    sun: [],
  },
  durationMinutes: 45,
  bufferMinutes: 15,
  minimumNoticeHours: 24,
  horizonDays: 14,
  stepMinutes: 15,
};

const WEEKDAYS: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MINUTE_MS = 60_000;

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function overlaps(start: number, end: number, busy: Interval[]): boolean {
  return busy.some((interval) => start < interval.end.getTime() && end > interval.start.getTime());
}

export function resolveTimeZone(candidate: string | null | undefined, fallback: string): string {
  if (!candidate) return fallback;
  try {
    new Intl.DateTimeFormat('en', { timeZone: candidate });
    return candidate;
  } catch {
    return fallback;
  }
}

export function computeAvailableSlots(input: {
  now: Date;
  rules: BookingRules;
  busy: Interval[];
}): Date[] {
  const { rules, busy } = input;
  const timeZone = resolveTimeZone(rules.timeZone, DEFAULT_BOOKING_RULES.timeZone);
  const earliest = input.now.getTime() + rules.minimumNoticeHours * 60 * MINUTE_MS;
  const today = new TZDate(input.now.getTime(), timeZone);
  const durationMs = rules.durationMinutes * MINUTE_MS;
  const bufferMs = rules.bufferMinutes * MINUTE_MS;
  const slots: Date[] = [];

  for (let offset = 0; offset <= rules.horizonDays; offset += 1) {
    const day = new TZDate(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + offset,
      timeZone,
    );
    const windows = rules.weeklyHours[WEEKDAYS[day.getDay()] ?? 'sun'] ?? [];

    for (const window of windows) {
      const windowEnd = minutesOf(window.end);
      for (
        let minute = minutesOf(window.start);
        minute + rules.durationMinutes <= windowEnd;
        minute += rules.stepMinutes
      ) {
        const start = new TZDate(
          day.getFullYear(),
          day.getMonth(),
          day.getDate(),
          Math.floor(minute / 60),
          minute % 60,
          0,
          timeZone,
        ).getTime();
        if (start < earliest) continue;
        if (overlaps(start - bufferMs, start + durationMs + bufferMs, busy)) continue;
        slots.push(new Date(start));
      }
    }
  }

  return slots.sort((first, second) => first.getTime() - second.getTime());
}

function localDay(date: Date, timeZone: string): string {
  const local = new TZDate(date.getTime(), timeZone);
  const month = String(local.getMonth() + 1).padStart(2, '0');
  const day = String(local.getDate()).padStart(2, '0');
  return `${local.getFullYear()}-${month}-${day}`;
}

export function groupSlotsByDay(
  slots: Date[],
  timeZone: string,
): Array<{ day: string; slots: Date[] }> {
  const groups = new Map<string, Date[]>();
  for (const slot of slots) {
    const key = localDay(slot, timeZone);
    groups.set(key, [...(groups.get(key) ?? []), slot]);
  }
  return [...groups.entries()].map(([day, daySlots]) => ({ day, slots: daySlots }));
}
