import { addDays } from 'date-fns';
import { TZDate } from '@date-fns/tz';

function isWeekend(date: TZDate): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** Adds working days (Monday to Friday) in the given time zone, keeping the local time of day. */
export function addBusinessDays(date: Date, days: number, timeZone: string): Date {
  let current = new TZDate(date.getTime(), timeZone);
  let remaining = days;
  while (remaining > 0) {
    current = addDays(current, 1);
    if (!isWeekend(current)) remaining -= 1;
  }
  return new Date(current.getTime());
}
