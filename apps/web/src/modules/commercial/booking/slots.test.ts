import { describe, expect, it } from 'vitest';
import {
  computeAvailableSlots,
  DEFAULT_BOOKING_RULES,
  groupSlotsByDay,
  resolveTimeZone,
  type BookingRules,
} from './slots';

const RULES: BookingRules = { ...DEFAULT_BOOKING_RULES, minimumNoticeHours: 0, horizonDays: 14 };

function iso(dates: Date[]): string[] {
  return dates.map((date) => date.toISOString());
}

describe('computeAvailableSlots', () => {
  it('offers slots only inside weekly hours', () => {
    const slots = computeAvailableSlots({
      now: new Date('2026-10-12T06:00:00Z'),
      rules: { ...RULES, horizonDays: 0 },
      busy: [],
    });

    expect(iso(slots).at(0)).toBe('2026-10-12T09:00:00.000Z');
    expect(iso(slots).at(-1)).toBe('2026-10-12T16:15:00.000Z');
    expect(slots).toHaveLength(30);
  });

  it('respects minimum notice and horizon', () => {
    const now = new Date('2026-10-12T08:00:00Z');
    const slots = computeAvailableSlots({ now, rules: DEFAULT_BOOKING_RULES, busy: [] });

    expect(slots[0]?.getTime()).toBeGreaterThanOrEqual(now.getTime() + 24 * 3_600_000);
    expect(iso(slots).at(-1)?.startsWith('2026-10-26')).toBe(true);
    expect(slots.some((slot) => slot.toISOString().startsWith('2026-10-27'))).toBe(false);
  });

  it('removes slots that overlap busy intervals including the buffer', () => {
    const slots = computeAvailableSlots({
      now: new Date('2026-10-12T06:00:00Z'),
      rules: { ...RULES, horizonDays: 0 },
      busy: [{ start: new Date('2026-10-12T11:00:00Z'), end: new Date('2026-10-12T12:00:00Z') }],
    });
    const times = iso(slots);

    expect(times).toContain('2026-10-12T10:00:00.000Z');
    expect(times).not.toContain('2026-10-12T10:15:00.000Z');
    expect(times).not.toContain('2026-10-12T12:00:00.000Z');
    expect(times).toContain('2026-10-12T12:15:00.000Z');
  });

  it('handles the October DST change in Lisbon', () => {
    const friday = computeAvailableSlots({
      now: new Date('2026-10-23T00:00:00Z'),
      rules: { ...RULES, horizonDays: 0 },
      busy: [],
    });
    const monday = computeAvailableSlots({
      now: new Date('2026-10-26T00:00:00Z'),
      rules: { ...RULES, horizonDays: 0 },
      busy: [],
    });

    expect(friday[0]?.toISOString()).toBe('2026-10-23T09:00:00.000Z');
    expect(monday[0]?.toISOString()).toBe('2026-10-26T10:00:00.000Z');
  });

  it('offers nothing on days without hours', () => {
    const saturday = computeAvailableSlots({
      now: new Date('2026-10-17T06:00:00Z'),
      rules: { ...RULES, horizonDays: 0 },
      busy: [],
    });
    expect(saturday).toEqual([]);
  });
});

describe('groupSlotsByDay', () => {
  it('groups slots by day in Africa/Luanda', () => {
    const groups = groupSlotsByDay(
      [
        new Date('2026-10-12T09:00:00Z'),
        new Date('2026-10-12T16:15:00Z'),
        new Date('2026-10-13T09:00:00Z'),
      ],
      'Africa/Luanda',
    );

    expect(groups.map((group) => [group.day, group.slots.length])).toEqual([
      ['2026-10-12', 2],
      ['2026-10-13', 1],
    ]);
  });

  it('places a late slot on the next local day', () => {
    const groups = groupSlotsByDay([new Date('2026-10-12T23:30:00Z')], 'Africa/Luanda');
    expect(groups[0]?.day).toBe('2026-10-13');
  });
});

describe('resolveTimeZone', () => {
  it('invalid visitor time zone falls back to the booking time zone', () => {
    expect(resolveTimeZone('Mars/Phobos', 'Europe/Lisbon')).toBe('Europe/Lisbon');
    expect(resolveTimeZone(null, 'Europe/Lisbon')).toBe('Europe/Lisbon');
    expect(resolveTimeZone('Africa/Luanda', 'Europe/Lisbon')).toBe('Africa/Luanda');
  });
});
