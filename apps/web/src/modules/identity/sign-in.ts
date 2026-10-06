import { logger } from '@/platform/logger';
import { listTotpFactors, normalizeEmail, readClaims, type IdentityDeps } from './auth-port';

export type SignInResult =
  { next: 'mfa_enroll' | 'mfa_verify' | 'done' } | { error: 'invalid_credentials' };

export async function signInWithPassword(
  input: { email: string; password: string },
  deps: IdentityDeps,
): Promise<SignInResult> {
  const { error } = await deps.auth.signInWithPassword({
    email: normalizeEmail(input.email),
    password: input.password,
  });
  if (error) {
    logger.warn('auth.sign_in_rejected', {
      reason: error.code ?? error.name,
      status: error.status,
    });
    return { error: 'invalid_credentials' };
  }

  const claims = await readClaims(deps.auth);
  if (!claims) {
    logger.warn('auth.sign_in_claims_unavailable');
    return { error: 'invalid_credentials' };
  }

  await deps.audit(claims, 'auth.sign_in');
  if (claims.user_kind === 'internal') await deps.startActivity(claims.session_id);

  const factors = await listTotpFactors(deps.auth);
  if (factors.some((factor) => factor.status === 'verified')) return { next: 'mfa_verify' };
  if (claims.user_kind === 'internal') return { next: 'mfa_enroll' };
  return { next: 'done' };
}
