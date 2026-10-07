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
  'deal.stage_changed',
  'deal.updated',
  'application.submitted',
  'application.reviewed',
  'application.anonymized',
  'call.booked',
  'call.rescheduled',
  'call.cancelled',
  'call.outcome_recorded',
  'calendar.connected',
  'calendar.disconnected',
  'commercial_settings.updated',
  'application_form.published',
  'message_template.saved',
  'acquisition_target.saved',
  'acquisition_target.converted',
  'contact.saved',
  'follow_up.completed',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export function isAuditAction(value: string): value is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(value);
}
