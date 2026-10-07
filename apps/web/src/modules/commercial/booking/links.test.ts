import { describe, expect, it } from 'vitest';
import { bookingLinkToken, bookingUrl, manageUrl } from './links';

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
});
