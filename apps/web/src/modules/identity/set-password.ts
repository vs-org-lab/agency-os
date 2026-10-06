import type { AuditAction } from '@/modules/audit';
import type { VerifiedClaims } from '@/platform/db';
import { validatePassword } from './password-policy';

export type SetPasswordDeps = {
  updatePassword: (password: string) => Promise<{ ok: boolean }>;
  isPwned: (password: string) => Promise<boolean>;
  audit: (claims: VerifiedClaims, action: AuditAction) => Promise<void>;
};

export type SetPasswordResult =
  { ok: true } | { error: 'too_short' | 'pwned' | 'check_unavailable' | 'update_failed' };

export async function setPassword(
  claims: VerifiedClaims,
  input: { password: string },
  deps: SetPasswordDeps,
): Promise<SetPasswordResult> {
  const validation = await validatePassword(input.password, { isPwned: deps.isPwned });
  if (!validation.ok) return { error: validation.reason };

  const { ok } = await deps.updatePassword(input.password);
  if (!ok) return { error: 'update_failed' };

  await deps.audit(claims, 'password.changed');
  return { ok: true };
}
