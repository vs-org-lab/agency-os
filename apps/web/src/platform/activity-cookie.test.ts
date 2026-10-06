import { describe, expect, it } from 'vitest';
import {
  activityCookieName,
  isInactive,
  shouldRefreshActivity,
  signActivity,
  verifyActivity,
} from './activity-cookie';

const SECRET = 'a'.repeat(44);
const SESSION = '5b0b7f3e-2b5c-4a52-9d3e-8f1a2b3c4d5e';
const OTHER_SESSION = '6c1c8a4f-3c6d-4b63-8e4f-9a2b3c4d5e6f';

describe('activity cookie', () => {
  it('activity cookie round-trips', () => {
    const at = new Date('2026-10-06T10:00:00.000Z');
    const value = signActivity(at, SECRET, SESSION);

    expect(verifyActivity(value, SECRET, SESSION, new Date('2026-10-06T10:05:00.000Z'))).toEqual({
      valid: true,
      at,
    });
  });

  it('rejects tampered or future activity cookie', () => {
    const now = new Date('2026-10-06T10:00:00.000Z');
    const value = signActivity(now, SECRET, SESSION);
    const [timestamp, signature] = value.split('.');
    const tampered = `${Number(timestamp) + 3_600_000}.${signature}`;
    const future = signActivity(new Date(now.getTime() + 5 * 60_000), SECRET, SESSION);

    expect(verifyActivity(tampered, SECRET, SESSION, now)).toEqual({ valid: false });
    expect(verifyActivity(future, SECRET, SESSION, now)).toEqual({ valid: false });
    expect(verifyActivity(value, 'b'.repeat(44), SESSION, now)).toEqual({ valid: false });
    expect(verifyActivity(undefined, SECRET, SESSION, now)).toEqual({ valid: false });
    expect(verifyActivity('garbage', SECRET, SESSION, now)).toEqual({ valid: false });
  });

  it('rejects a cookie signed for another session', () => {
    const now = new Date('2026-10-06T10:00:00.000Z');

    expect(verifyActivity(signActivity(now, SECRET, OTHER_SESSION), SECRET, SESSION, now)).toEqual({
      valid: false,
    });
  });

  it('tolerates small clock skew', () => {
    const now = new Date('2026-10-06T10:00:00.000Z');
    const slightlyAhead = signActivity(new Date(now.getTime() + 30_000), SECRET, SESSION);

    expect(verifyActivity(slightlyAhead, SECRET, SESSION, now).valid).toBe(true);
  });

  it('isInactive is false at 7h59m and true at 8h01m', () => {
    const at = new Date('2026-10-06T00:00:00.000Z');

    expect(isInactive(at, new Date(at.getTime() + (7 * 60 + 59) * 60_000))).toBe(false);
    expect(isInactive(at, new Date(at.getTime() + (8 * 60 + 1) * 60_000))).toBe(true);
  });

  it('refreshes the cookie at most once per minute', () => {
    const at = new Date('2026-10-06T00:00:00.000Z');

    expect(shouldRefreshActivity(at, new Date(at.getTime() + 59_000))).toBe(false);
    expect(shouldRefreshActivity(at, new Date(at.getTime() + 61_000))).toBe(true);
  });

  it('uses the __Host- prefix only on secure origins', () => {
    expect(activityCookieName(true)).toBe('__Host-activity');
    expect(activityCookieName(false)).toBe('activity');
  });
});
