import { randomBytes } from 'node:crypto';

export type SecurityHeaderOptions = {
  isDevelopment?: boolean;
  connectSources?: string[];
  frameSources?: string[];
  frameAncestors?: string[];
};

const FIGMA_FRAME_SOURCES = ['https://www.figma.com', 'https://embed.figma.com'];

const EMBEDDABLE_PATH = /^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?apply(?:\/|$)/;

function originOf(candidate: string): string | null {
  try {
    const url = new URL(candidate.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}

export function embedOriginsForPath(pathname: string, configured: string | undefined): string[] {
  if (!configured || !EMBEDDABLE_PATH.test(pathname)) return [];
  const origins = configured.split(',').map(originOf);
  return [...new Set(origins.filter((origin): origin is string => origin !== null))];
}

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
    'frame-ancestors': options.frameAncestors?.length ? options.frameAncestors : ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };

  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(' ')}`);
  if (!options.isDevelopment) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}

export function buildSecurityHeaders(nonce: string, options: SecurityHeaderOptions = {}): Headers {
  const headers = new Headers({
    'Content-Security-Policy': buildContentSecurityPolicy(nonce, options),
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  });
  if (!options.frameAncestors?.length) headers.set('X-Frame-Options', 'DENY');
  return headers;
}
