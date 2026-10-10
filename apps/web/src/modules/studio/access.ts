import type { Actor } from '@/modules/access';

const STUDIO_ROLES = ['founder', 'project_manager', 'freelancer', 'finance'];

export function isStudioStaff(actor: Actor): boolean {
  return actor.mfaVerifiedAt !== null && actor.roles.some((role) => STUDIO_ROLES.includes(role));
}
