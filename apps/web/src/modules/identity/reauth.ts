import type { VerifiedClaims } from '@/platform/db';

export const REAUTHENTICATION_WINDOW_MS = 15 * 60 * 1000;

export type RecentMfaResult = { ok: true } | { ok: false; reason: 'reauthentication_required' };

export function requireRecentMfa(
  claims: VerifiedClaims,
  now: Date,
  maxAgeMs: number = REAUTHENTICATION_WINDOW_MS,
): RecentMfaResult {
  const latestTotp = claims.amr
    .filter((entry) => entry.method === 'totp')
    .reduce<number | null>((latest, entry) => Math.max(latest ?? 0, entry.timestamp), null);

  if (claims.aal !== 'aal2' || latestTotp === null) {
    return { ok: false, reason: 'reauthentication_required' };
  }
  if (now.getTime() - latestTotp * 1000 > maxAgeMs) {
    return { ok: false, reason: 'reauthentication_required' };
  }
  return { ok: true };
}
