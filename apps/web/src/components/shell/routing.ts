import { authorize, type AccessContext, type Actor } from '@/modules/access';

export type HomePath = '/sign-in' | '/mfa/verify' | '/' | '/portal';

export function resolveHome(actor: Actor | null): HomePath {
  if (!actor) return '/sign-in';
  if (actor.roles.some((role) => role !== 'agent')) {
    return actor.mfaVerifiedAt ? '/' : '/mfa/verify';
  }
  return '/portal';
}

export function roomAccess(
  actor: Actor,
  clientId: string,
  ctx: AccessContext,
  client: { exists: boolean },
): 'allowed' | 'not_found' {
  if (!client.exists) return 'not_found';
  return authorize(actor, 'read', { type: 'rooms', clientId }, ctx).allowed
    ? 'allowed'
    : 'not_found';
}
