import { createHmac } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { DbTransaction, ThrottleKind } from '@agency-os/db';

export const THROTTLE_LIMITS = {
  applicationIp: { limit: 5, windowSeconds: 3600 },
  applicationEmail: { limit: 3, windowSeconds: 86_400 },
  bookingIp: { limit: 10, windowSeconds: 3600 },
} as const;

export type ThrottleInput = {
  organizationId: string;
  kind: ThrottleKind;
  key: string;
  limit: number;
  windowSeconds: number;
  now: Date;
  secret: string;
};

export function hashForThrottle(value: string, secret: string): string {
  return createHmac('sha256', secret).update(`throttle:${value}`).digest('base64url');
}

export async function consumeThrottle(tx: DbTransaction, input: ThrottleInput): Promise<boolean> {
  const windowMs = input.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(input.now.getTime() / windowMs) * windowMs);
  const rows = await tx.execute<{ count: number }>(sql`
    insert into public.submission_throttle (organization_id, kind, key_hash, window_start)
    values (
      ${input.organizationId}::uuid,
      ${input.kind}::app.throttle_kind,
      ${hashForThrottle(input.key, input.secret)},
      ${windowStart.toISOString()}::timestamptz
    )
    on conflict (organization_id, kind, key_hash, window_start)
    do update set count = public.submission_throttle.count + 1, updated_at = now()
    returning count
  `);
  return (rows[0]?.count ?? Number.POSITIVE_INFINITY) <= input.limit;
}
