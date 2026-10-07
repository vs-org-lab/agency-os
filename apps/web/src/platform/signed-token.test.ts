import { describe, expect, it } from 'vitest';
import { signToken, verifyToken } from './signed-token';

const SECRET = 'a-secret-that-is-long-enough-for-hmac-signing';
const NOW = new Date('2026-10-07T12:00:00Z');
const LATER = new Date('2026-10-07T14:00:00Z');

describe('signed tokens', () => {
  it('round-trips data before expiry', () => {
    const token = signToken('apply_thanks', { applicationId: 'abc', path: 'a' }, SECRET, LATER);
    expect(verifyToken(token, 'apply_thanks', SECRET, NOW)).toEqual({
      applicationId: 'abc',
      path: 'a',
    });
  });

  it('rejects an expired token', () => {
    const token = signToken('apply_thanks', { applicationId: 'abc' }, SECRET, NOW);
    expect(verifyToken(token, 'apply_thanks', SECRET, LATER)).toBeNull();
  });

  it('rejects a token signed for another purpose', () => {
    const token = signToken('booking_link', { dealId: 'abc' }, SECRET, LATER);
    expect(verifyToken(token, 'apply_thanks', SECRET, NOW)).toBeNull();
  });

  it('rejects a tampered payload or signature', () => {
    const token = signToken('apply_thanks', { applicationId: 'abc' }, SECRET, LATER);
    const [payload, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ p: 'apply_thanks', e: LATER.getTime(), d: { applicationId: 'xyz' } }),
    ).toString('base64url');

    expect(verifyToken(`${forged}.${signature}`, 'apply_thanks', SECRET, NOW)).toBeNull();
    expect(verifyToken(`${payload}.AAAA`, 'apply_thanks', SECRET, NOW)).toBeNull();
    expect(verifyToken(token, 'apply_thanks', `${SECRET}-other`, NOW)).toBeNull();
    expect(verifyToken('not-a-token', 'apply_thanks', SECRET, NOW)).toBeNull();
  });
});
