import { TZDate } from '@date-fns/tz';

export const QUIET_HOURS = { startHour: 20, endHour: 8 } as const;

const FALLBACK_TIME_ZONE = 'Europe/Lisbon';

function isKnownTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function nextAllowedSendTime(now: Date, timeZone: string): Date {
  const zone = isKnownTimeZone(timeZone) ? timeZone : FALLBACK_TIME_ZONE;
  const local = new TZDate(now.getTime(), zone);
  const hour = local.getHours();
  if (hour >= QUIET_HOURS.endHour && hour < QUIET_HOURS.startHour) return now;

  const dayOffset = hour >= QUIET_HOURS.startHour ? 1 : 0;
  const allowed = new TZDate(
    local.getFullYear(),
    local.getMonth(),
    local.getDate() + dayOffset,
    QUIET_HOURS.endHour,
    0,
    0,
    zone,
  );
  return new Date(allowed.getTime());
}

export function senderName(founderFullName: string, agencyName: string): string {
  const firstName = founderFullName.trim().split(/\s+/)[0] ?? '';
  return firstName === '' ? agencyName : `${firstName}, ${agencyName}`;
}
