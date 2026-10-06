import { createHmac, timingSafeEqual } from 'node:crypto';

export const INACTIVITY_LIMIT_MS = 8 * 60 * 60 * 1000;
export const ACTIVITY_REFRESH_INTERVAL_MS = 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;

export type ActivityVerification = { valid: true; at: Date } | { valid: false };

export function activityCookieName(secure: boolean): string {
  return secure ? '__Host-activity' : 'activity';
}

function signature(timestamp: number, secret: string, sessionId: string): Buffer {
  return createHmac('sha256', secret).update(`${sessionId}:${timestamp}`).digest();
}

export function signActivity(at: Date, secret: string, sessionId: string): string {
  const timestamp = at.getTime();
  return `${timestamp}.${signature(timestamp, secret, sessionId).toString('base64url')}`;
}

export function verifyActivity(
  value: string | undefined,
  secret: string,
  sessionId: string,
  now: Date,
): ActivityVerification {
  if (!value) return { valid: false };
  const [rawTimestamp, rawSignature, ...rest] = value.split('.');
  if (!rawTimestamp || !rawSignature || rest.length > 0 || !/^\d+$/.test(rawTimestamp)) {
    return { valid: false };
  }

  const timestamp = Number(rawTimestamp);
  const expected = signature(timestamp, secret, sessionId);
  const provided = Buffer.from(rawSignature, 'base64url');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { valid: false };
  }
  if (timestamp > now.getTime() + MAX_CLOCK_SKEW_MS) return { valid: false };

  return { valid: true, at: new Date(timestamp) };
}

export function isInactive(at: Date, now: Date, limitMs: number = INACTIVITY_LIMIT_MS): boolean {
  return now.getTime() - at.getTime() > limitMs;
}

export function shouldRefreshActivity(at: Date, now: Date): boolean {
  return now.getTime() - at.getTime() > ACTIVITY_REFRESH_INTERVAL_MS;
}
