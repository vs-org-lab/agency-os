import { describe, expect, it } from 'vitest';
import { clientIpAddress, isSecureRequest, requestOrigin } from './request';

describe('request helpers', () => {
  it('prefers x-forwarded-proto over the fallback protocol', () => {
    expect(isSecureRequest(new Headers({ 'x-forwarded-proto': 'https' }), 'http:')).toBe(true);
    expect(isSecureRequest(new Headers({ 'x-forwarded-proto': 'http' }), 'https:')).toBe(false);
    expect(isSecureRequest(new Headers(), 'https:')).toBe(true);
    expect(isSecureRequest(new Headers())).toBe(false);
  });

  it('builds the origin from forwarded headers', () => {
    expect(
      requestOrigin(
        new Headers({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'os.example' }),
      ),
    ).toBe('https://os.example');
    expect(requestOrigin(new Headers({ host: 'localhost:3000' }))).toBe('http://localhost:3000');
  });

  it('takes the first forwarded client address', () => {
    expect(clientIpAddress(new Headers({ 'x-forwarded-for': '203.0.113.1, 10.0.0.1' }))).toBe(
      '203.0.113.1',
    );
    expect(clientIpAddress(new Headers())).toBeNull();
  });
});
