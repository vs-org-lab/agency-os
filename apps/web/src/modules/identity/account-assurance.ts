import type { VerifiedClaims } from '@/platform/db';

export function accountActionAllowed(
  claims: VerifiedClaims,
  factors: { hasVerifiedFactor: boolean },
): boolean {
  return !factors.hasVerifiedFactor || claims.aal === 'aal2';
}
