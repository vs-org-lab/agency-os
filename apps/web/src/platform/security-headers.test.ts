import { describe, expect, it } from 'vitest';
import {
  allowsMediaCapture,
  buildSecurityHeaders,
  embedOriginsForPath,
  generateNonce,
} from './security-headers';

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name = '', ...values] = part.split(/\s+/);
        return [name, values];
      }),
  );
}

describe('security headers', () => {
  it('csp contains nonce, default-src self, frame-ancestors none, object-src none', () => {
    const csp = directives(buildSecurityHeaders('abc123').get('Content-Security-Policy') ?? '');

    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('script-src')).toContain("'nonce-abc123'");
    expect(csp.get('script-src')).toContain("'strict-dynamic'");
    expect(csp.get('script-src')).not.toContain("'unsafe-inline'");
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'self'"]);
    expect(csp.get('form-action')).toEqual(["'self'"]);
  });

  it('frames are limited to figma and the configured signature provider', () => {
    const csp = directives(
      buildSecurityHeaders('n', { frameSources: ['https://sign.example.eu'] }).get(
        'Content-Security-Policy',
      ) ?? '',
    );

    expect(csp.get('frame-src')).toEqual([
      'https://www.figma.com',
      'https://embed.figma.com',
      'https://sign.example.eu',
    ]);
  });

  it('serves proof images and videos from the storage origin only', () => {
    const csp = directives(
      buildSecurityHeaders('abc123', {
        storageSources: ['https://project.supabase.co'],
      }).get('Content-Security-Policy') ?? '',
    );

    expect(csp.get('img-src')).toEqual(["'self'", 'data:', 'blob:', 'https://project.supabase.co']);
    expect(csp.get('media-src')).toEqual(["'self'", 'blob:', 'https://project.supabase.co']);
    expect(csp.get('worker-src')).toEqual(["'self'", 'blob:']);
    expect(
      directives(buildSecurityHeaders('abc123').get('Content-Security-Policy') ?? '').get(
        'media-src',
      ),
    ).toEqual(["'self'", 'blob:']);
  });

  it('allows unsafe-eval only in development', () => {
    const production = buildSecurityHeaders('n').get('Content-Security-Policy') ?? '';
    const development =
      buildSecurityHeaders('n', { isDevelopment: true }).get('Content-Security-Policy') ?? '';

    expect(production).not.toContain("'unsafe-eval'");
    expect(development).toContain("'unsafe-eval'");
  });

  it('hsts max-age is at least 31536000 with includeSubDomains', () => {
    const hsts = buildSecurityHeaders('n').get('Strict-Transport-Security') ?? '';
    const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1]);

    expect(maxAge).toBeGreaterThanOrEqual(31_536_000);
    expect(hsts).toContain('includeSubDomains');
  });

  it('includes nosniff, strict-origin-when-cross-origin referrer and restrictive permissions-policy', () => {
    const headers = buildSecurityHeaders('n');

    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    const permissions = headers.get('Permissions-Policy') ?? '';
    for (const feature of ['camera=()', 'microphone=()', 'geolocation=()', 'payment=()']) {
      expect(permissions).toContain(feature);
    }
  });

  it('allows the microphone and tab capture only where media capture is enabled', () => {
    const blocked = buildSecurityHeaders('n').get('Permissions-Policy') ?? '';
    const allowed =
      buildSecurityHeaders('n', { mediaCapture: true }).get('Permissions-Policy') ?? '';

    expect(blocked).toContain('microphone=()');
    expect(blocked).toContain('display-capture=()');
    expect(allowed).toContain('microphone=(self)');
    expect(allowed).toContain('display-capture=(self)');
    expect(allowed).toContain('camera=()');
  });

  it('enables media capture on the call mode route only', () => {
    expect(allowsMediaCapture('/pipeline/2f1c/core/call')).toBe(true);
    expect(allowsMediaCapture('/en/pipeline/2f1c/core/call')).toBe(true);
    expect(allowsMediaCapture('/pipeline/2f1c')).toBe(false);
    expect(allowsMediaCapture('/pipeline/2f1c/core/call/extra')).toBe(false);
    expect(allowsMediaCapture('/portal')).toBe(false);
  });

  it('allows configured embed origins on apply routes', () => {
    const configured =
      'https://aurion.agency, https://www.aurion.agency/path, javascript:alert(1), nonsense';

    expect(embedOriginsForPath('/apply', configured)).toEqual([
      'https://aurion.agency',
      'https://www.aurion.agency',
    ]);
    expect(embedOriginsForPath('/en/apply/thanks', configured)).toEqual([
      'https://aurion.agency',
      'https://www.aurion.agency',
    ]);
    expect(embedOriginsForPath('/applications', configured)).toEqual([]);
    expect(embedOriginsForPath('/sign-in', configured)).toEqual([]);
    expect(embedOriginsForPath('/apply', undefined)).toEqual([]);
  });

  it('keeps frame-ancestors none elsewhere', () => {
    const csp = directives(
      buildSecurityHeaders('n', { frameAncestors: [] }).get('Content-Security-Policy') ?? '',
    );
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
  });

  it('drops X-Frame-Options only when embedding is allowed', () => {
    const embedded = buildSecurityHeaders('n', { frameAncestors: ['https://aurion.agency'] });
    const csp = directives(embedded.get('Content-Security-Policy') ?? '');

    expect(csp.get('frame-ancestors')).toEqual(['https://aurion.agency']);
    expect(embedded.get('X-Frame-Options')).toBeNull();
    expect(buildSecurityHeaders('n').get('X-Frame-Options')).toBe('DENY');
  });

  it('generates unique base64 nonces of at least 128 bits', () => {
    const first = generateNonce();
    const second = generateNonce();

    expect(first).not.toBe(second);
    expect(Buffer.from(first, 'base64').length).toBeGreaterThanOrEqual(16);
  });
});
