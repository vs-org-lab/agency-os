import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

describe('brand hub security headers', () => {
  it('the public site sends security headers', () => {
    const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
      headers?: HeaderRule[];
    };

    const rule = config.headers?.find((entry) => entry.source === '/(.*)');
    expect(rule).toBeDefined();
    expect(rule?.headers).toHaveLength(6);
    expect(rule?.headers).toEqual(
      expect.arrayContaining([
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ]),
    );
  });
});
