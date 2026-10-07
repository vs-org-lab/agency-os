import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export type TokenPurpose = 'apply_thanks' | 'booking_link' | 'google_oauth';

const payloadSchema = z.object({
  p: z.string(),
  e: z.number().int(),
  d: z.record(z.string(), z.string()),
});

function sign(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

export function signToken(
  purpose: TokenPurpose,
  data: Record<string, string>,
  secret: string,
  expiresAt: Date,
): string {
  const encodedPayload = Buffer.from(
    JSON.stringify({ p: purpose, e: expiresAt.getTime(), d: data }),
  ).toString('base64url');
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export function verifyToken(
  token: string,
  purpose: TokenPurpose,
  secret: string,
  now: Date,
): Record<string, string> | null {
  const [encodedPayload, signature, ...rest] = token.split('.');
  if (!encodedPayload || !signature || rest.length > 0) return null;

  const expected = Buffer.from(sign(encodedPayload, secret));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const parsed = payloadSchema.safeParse(decoded);
  if (!parsed.success || parsed.data.p !== purpose || parsed.data.e <= now.getTime()) return null;
  return parsed.data.d;
}
