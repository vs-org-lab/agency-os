import { describe, expect, it } from 'vitest';
import { clientColor } from './colors';
import { dayBounds, lisbonDay, monthGrid, weekDays } from './grid';
import { meetingSchema } from './meeting';

const CLIENT = '3f2b8c1e-7d4a-4c6e-9b1a-2e5f8d7c6b4a';
const PROJECT = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const base = {
  kind: 'meeting',
  clientId: CLIENT,
  projectId: null,
  title: ' Revisão de marca ',
  notes: '',
  location: '',
  startsAt: '2026-10-13T09:00:00.000Z',
  endsAt: '2026-10-13T10:00:00.000Z',
  inviteClient: true,
};

describe('agenda domain', () => {
  it('meetings are validated against the spec rules', () => {
    const parsed = meetingSchema.safeParse(base);
    expect(parsed.success && parsed.data.title).toBe('Revisão de marca');
    expect(parsed.success && parsed.data.startsAt instanceof Date).toBe(true);

    const refused = [
      { ...base, kind: 'internal' },
      { ...base, kind: 'internal', clientId: null, inviteClient: true },
      { ...base, clientId: null },
      { ...base, kind: 'kickoff' },
      { ...base, endsAt: '2026-10-13T21:01:00.000Z' },
      { ...base, endsAt: base.startsAt },
      { ...base, title: '  ' },
      { ...base, title: 'a'.repeat(121) },
      { ...base, notes: 'a'.repeat(2001) },
      { ...base, location: 'a'.repeat(501) },
      { ...base, kind: 'party' },
    ];
    for (const input of refused) expect(meetingSchema.safeParse(input).success).toBe(false);

    expect(
      meetingSchema.safeParse({
        ...base,
        kind: 'internal',
        clientId: null,
        inviteClient: false,
      }).success,
    ).toBe(true);
    expect(meetingSchema.safeParse({ ...base, kind: 'kickoff', projectId: PROJECT }).success).toBe(
      true,
    );
    expect(meetingSchema.safeParse({ ...base, endsAt: '2026-10-13T21:00:00.000Z' }).success).toBe(
      true,
    );
  });

  it('grids follow Lisbon across daylight saving changes', () => {
    const october = monthGrid('2026-10');
    expect(october[0]?.[0]).toBe('2026-09-28');
    expect(october.at(-1)?.at(-1)).toBe('2026-11-01');
    expect(october.every((week) => week.length === 7)).toBe(true);
    const days = october.flat();
    expect(new Set(days).size).toBe(days.length);

    expect(weekDays('2026-10-25')).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
    expect(weekDays('2026-03-30')[0]).toBe('2026-03-30');

    const autumn = dayBounds('2026-10-25');
    expect(autumn.start.toISOString()).toBe('2026-10-24T23:00:00.000Z');
    expect(autumn.end.getTime() - autumn.start.getTime()).toBe(25 * 3_600_000);
    const spring = dayBounds('2026-03-29');
    expect(spring.end.getTime() - spring.start.getTime()).toBe(23 * 3_600_000);

    expect(lisbonDay(new Date('2026-10-24T23:30:00Z'))).toBe('2026-10-25');
    expect(lisbonDay(new Date('2026-12-31T23:30:00Z'))).toBe('2026-12-31');
  });

  it('client colours are stable', () => {
    expect(clientColor(CLIENT)).toBe(clientColor(CLIENT));
    expect(clientColor(CLIENT)).toBeGreaterThanOrEqual(0);
    expect(clientColor(CLIENT)).toBeLessThan(8);
    const spread = new Set(
      Array.from({ length: 40 }, (_, index) =>
        clientColor(`${index}-3f2b8c1e-7d4a-4c6e-9b1a-2e5f8d7c6b4a`),
      ),
    );
    expect(spread.size).toBeGreaterThan(3);
  });
});
