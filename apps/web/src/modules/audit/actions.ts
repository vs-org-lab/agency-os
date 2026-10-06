export const AUDIT_ACTIONS = [
  'auth.sign_in',
  'auth.sign_out',
  'auth.mfa_failed',
  'auth.mfa_enrolled',
  'invitation.created',
  'invitation.accepted',
  'membership.changed',
  'session.revoked',
  'password.changed',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export function isAuditAction(value: string): value is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(value);
}
