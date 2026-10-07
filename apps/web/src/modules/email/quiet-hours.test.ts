import { describe, expect, it } from 'vitest';
import { nextAllowedSendTime, senderName } from './quiet-hours';

describe('nextAllowedSendTime', () => {
  it('sends immediately at 14:00 Lisbon', () => {
    const now = new Date('2026-10-07T13:00:00Z');
    expect(nextAllowedSendTime(now, 'Europe/Lisbon')).toEqual(now);
  });

  it('defers 21:30 Lisbon to 08:00 next day', () => {
    expect(nextAllowedSendTime(new Date('2026-10-07T20:30:00Z'), 'Europe/Lisbon')).toEqual(
      new Date('2026-10-08T07:00:00Z'),
    );
  });

  it('defers 06:00 Luanda to 08:00 Luanda', () => {
    expect(nextAllowedSendTime(new Date('2026-10-07T05:00:00Z'), 'Africa/Luanda')).toEqual(
      new Date('2026-10-07T07:00:00Z'),
    );
  });

  it('handles the October DST change in Lisbon', () => {
    expect(nextAllowedSendTime(new Date('2026-10-24T22:00:00Z'), 'Europe/Lisbon')).toEqual(
      new Date('2026-10-25T08:00:00Z'),
    );
  });

  it('falls back to Lisbon for an unknown time zone', () => {
    expect(nextAllowedSendTime(new Date('2026-10-07T20:30:00Z'), 'Mars/Phobos')).toEqual(
      new Date('2026-10-08T07:00:00Z'),
    );
  });
});

describe('senderName', () => {
  it('combines the founder first name and the agency name', () => {
    expect(senderName('Vladimir Silva', 'Aurion')).toBe('Vladimir, Aurion');
    expect(senderName('  ', 'Aurion')).toBe('Aurion');
  });
});
