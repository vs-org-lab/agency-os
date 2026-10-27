import { randomBytes } from 'node:crypto';

export type SecurityHeaderOptions = {
  isDevelopment?: boolean;
  connectSources?: string[];
  /** Origins that serve signed files shown in the page: proof images and videos (SEC-31). */
  storageSources?: string[];
  frameSources?: string[];
  frameAncestors?: string[];
  /** Allows the microphone and tab capture for this document (call mode recording). */
  mediaCapture?: boolean;
  /** Allows the microphone for this document (voice notes on proofs and approvals). */
  voiceCapture?: boolean;
  /** Allows the camera and the microphone for this document (client video testimonials). */
  cameraCapture?: boolean;
};

const FIGMA_FRAME_SOURCES = ['https://www.figma.com', 'https://embed.figma.com'];

const EMBEDDABLE_PATH = /^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?apply(?:\/|$)/;

const MEDIA_CAPTURE_PATH = /^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?pipeline\/[^/]+\/core\/call\/?$/;

const CAMERA_CAPTURE_PATH = /^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?portal(?:\/|$)/;

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

export function allowsMediaCapture(pathname: string): boolean {
  return MEDIA_CAPTURE_PATH.test(pathname);
}

// Pages change without a document load, so the policy of the first document covers every page
// reached from it: voice capture spans the app and camera capture spans the portal.
export function allowsVoiceCapture(pathname: string): boolean {
  return !EMBEDDABLE_PATH.test(pathname);
}

export function allowsCameraCapture(pathname: string): boolean {
  return CAMERA_CAPTURE_PATH.test(pathname);
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
    'img-src': ["'self'", 'data:', 'blob:', ...(options.storageSources ?? [])],
    'media-src': ["'self'", 'blob:', ...(options.storageSources ?? [])],
    'worker-src': ["'self'", 'blob:'],
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
    'Permissions-Policy': [
      options.cameraCapture ? 'camera=(self)' : 'camera=()',
      options.mediaCapture || options.voiceCapture || options.cameraCapture
        ? 'microphone=(self)'
        : 'microphone=()',
      options.mediaCapture ? 'display-capture=(self)' : 'display-capture=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'browsing-topics=()',
    ].join(', '),
    'Cross-Origin-Opener-Policy': 'same-origin',
  });
  if (!options.frameAncestors?.length) headers.set('X-Frame-Options', 'DENY');
  return headers;
}
