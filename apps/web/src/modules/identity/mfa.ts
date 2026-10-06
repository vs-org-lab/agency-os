import { listTotpFactors, readClaims, type IdentityDeps } from './auth-port';

const TOTP_CODE = /^\d{6}$/;
const FACTOR_NAME = 'Authenticator';

export type TotpEnrollment = { factorId: string; qrCode: string; secret: string };

export async function enrollTotp(deps: Pick<IdentityDeps, 'auth'>): Promise<TotpEnrollment> {
  const stale = (await listTotpFactors(deps.auth)).filter((factor) => factor.status !== 'verified');
  for (const factor of stale) {
    await deps.auth.mfa.unenroll({ factorId: factor.id });
  }

  const { data, error } = await deps.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: FACTOR_NAME,
  });
  if (error || !data || data.type !== 'totp') {
    throw new Error('TOTP enrolment failed', { cause: error ?? undefined });
  }

  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export type VerifyTotpResult = { ok: true } | { error: 'invalid_code' };

export async function verifyTotp(
  input: { factorId: string; code: string; mode: 'enroll' | 'verify' },
  deps: IdentityDeps,
): Promise<VerifyTotpResult> {
  const code = input.code.trim();
  if (!TOTP_CODE.test(code)) return { error: 'invalid_code' };

  const before = await readClaims(deps.auth);
  if (!before) return { error: 'invalid_code' };

  const { error } = await deps.auth.mfa.challengeAndVerify({ factorId: input.factorId, code });
  if (error) {
    await deps.audit(before, 'auth.mfa_failed');
    return { error: 'invalid_code' };
  }

  const after = (await readClaims(deps.auth)) ?? before;
  if (input.mode === 'enroll') await deps.audit(after, 'auth.mfa_enrolled');
  if (after.user_kind === 'internal') await deps.startActivity(after.session_id);

  return { ok: true };
}
