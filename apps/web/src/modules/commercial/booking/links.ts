import { createHash, randomBytes } from 'node:crypto';
import { signToken } from '@/platform/signed-token';

export const BOOKING_LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function bookingLinkToken(dealId: string, secret: string, now: Date): string {
  return signToken(
    'booking_link',
    { dealId },
    secret,
    new Date(now.getTime() + BOOKING_LINK_TTL_MS),
  );
}

export function hashManageToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

export function newManageToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashManageToken(token) };
}

export function bookingUrl(baseUrl: string, token: string): string {
  const url = new URL('/apply/book', baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

export function manageUrl(baseUrl: string, token: string): string {
  return new URL(`/apply/booking/${token}`, baseUrl).toString();
}
