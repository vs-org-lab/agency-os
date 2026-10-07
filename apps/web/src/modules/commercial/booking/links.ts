import { createHash, createHmac } from 'node:crypto';
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

/**
 * Derived rather than random so every email about the same call carries the same working
 * link. A cancelled call stops being manageable, and a new booking gets a new call id.
 */
export function manageToken(callId: string, secret: string): string {
  return createHmac('sha256', secret).update(`manage:${callId}`).digest('base64url');
}

export function bookingUrl(baseUrl: string, token: string): string {
  const url = new URL('/apply/book', baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

export function manageUrl(baseUrl: string, token: string): string {
  return new URL(`/apply/booking/${token}`, baseUrl).toString();
}
