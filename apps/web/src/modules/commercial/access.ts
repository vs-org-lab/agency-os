import type { Actor } from '@/modules/access';

const PIPELINE_ROLES = ['founder', 'project_manager', 'finance'] as const;

export function canSeePipeline(actor: Actor): boolean {
  return (
    actor.mfaVerifiedAt !== null &&
    actor.roles.some((role) => (PIPELINE_ROLES as readonly string[]).includes(role))
  );
}

export function canWritePipeline(actor: Actor): boolean {
  return (
    actor.mfaVerifiedAt !== null &&
    actor.roles.some((role) => role === 'founder' || role === 'project_manager')
  );
}

export function isFounderActor(actor: Actor): boolean {
  return actor.mfaVerifiedAt !== null && actor.roles.includes('founder');
}
