import type { Actor } from '@/modules/access';

const READ_ROLES = ['founder', 'finance', 'project_manager'] as const;
const WRITE_ROLES = ['founder', 'finance'] as const;

function hasRole(actor: Actor, roles: readonly string[]): boolean {
  return actor.mfaVerifiedAt !== null && actor.roles.some((role) => roles.includes(role));
}

/** Invoices in the access matrix: founder, finance and project managers read. */
export function canReadBilling(actor: Actor): boolean {
  return hasRole(actor, READ_ROLES);
}

/** Only the founder and finance request, record or void payments. */
export function canWriteBilling(actor: Actor): boolean {
  return hasRole(actor, WRITE_ROLES);
}
