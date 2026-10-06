import { randomBytes } from 'node:crypto';

export type SecurityHeaderOptions = {
  isDevelopment?: boolean;
  connectSources?: string[];
  frameSources?: string[];
};

const FIGMA_FRAME_SOURCES = ['https://www.figma.com', 'https://embed.figma.com'];

export function generateNonce(): string {
  return randomBytes(16).toString('base64');
}

export function buildContentSecurityPolicy(
  nonce: string,
  options: SecurityHeaderOptions = {},
): string {
  const scriptSources = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (options.isDevelopment) scriptSources.push("'unsafe-eval'");

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': scriptSources,
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'", ...(options.connectSources ?? [])],
    'frame-src': [...FIGMA_FRAME_SOURCES, ...(options.frameSources ?? [])],
    'frame-ancestors': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };

  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(' ')}`);
  if (!options.isDevelopment) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}

export function buildSecurityHeaders(nonce: string, options: SecurityHeaderOptions = {}): Headers {
  return new Headers({
    'Content-Security-Policy': buildContentSecurityPolicy(nonce, options),
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  });
}
