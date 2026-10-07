import { describe, expect, it } from 'vitest';
import { bookingLinkToken, bookingUrl, manageToken, manageUrl } from './links';

describe('booking links', () => {
  it('booking url carries the signed token in the query string', () => {
    const token = bookingLinkToken(
      '11111111-1111-4111-8111-111111111111',
      'a-secret-that-is-long-enough-for-hmac-signing',
      new Date('2026-10-07T12:00:00Z'),
    );
    const url = new URL(bookingUrl('https://os.example.com', token));

    expect(token).toContain('.');
    expect(url.pathname).toBe('/apply/book');
    expect(url.searchParams.get('token')).toBe(token);
  });

  it('manage url keeps the random token in the path', () => {
    expect(manageUrl('https://os.example.com', 'abc_DEF-123')).toBe(
      'https://os.example.com/apply/booking/abc_DEF-123',
    );
  });

  it('manage token is stable per call and secret', () => {
    const secret = 'a-secret-that-is-long-enough-for-hmac-signing';
    const first = manageToken('11111111-1111-4111-8111-111111111111', secret);

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(manageToken('11111111-1111-4111-8111-111111111111', secret)).toBe(first);
    expect(manageToken('22222222-2222-4222-8222-222222222222', secret)).not.toBe(first);
    expect(manageToken('11111111-1111-4111-8111-111111111111', `${secret}-rotated`)).not.toBe(
      first,
    );
  });
});
