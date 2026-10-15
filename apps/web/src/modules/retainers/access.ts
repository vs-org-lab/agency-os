import type { Actor } from '@/modules/access';
import type { BillingDeps } from '@/modules/billing/server';
import { roomActor } from '@/modules/rooms/server';
import type { DbContexts, VerifiedClaims } from '@/platform/db';

export type RetainersDeps = {
  contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'>;
  /** Issues the retainer's payment requests (3B.2). */
  billing: Pick<BillingDeps, 'storage' | 'appBaseUrl'>;
  now?: () => Date;
  flush?: () => Promise<void>;
};

export type NotFound = { ok: false; rule: 'not_found' };
export const NOT_FOUND: NotFound = { ok: false, rule: 'not_found' };
export const INVALID_INPUT = { ok: false, rule: 'invalid_input' } as const;
export const INVALID_STATE = { ok: false, rule: 'invalid_state' } as const;
export const LIMIT_REACHED = { ok: false, rule: 'limit_reached' } as const;
export const OK = { ok: true } as const;

/** The room's writers manage the retainer, record usage and quote extra requests. */
export const retainerWriter = (claims: VerifiedClaims, clientId: string, deps: RetainersDeps) =>
  roomActor(deps.contexts, claims, clientId, 'write');

export const retainerReader = (claims: VerifiedClaims, clientId: string, deps: RetainersDeps) =>
  roomActor(deps.contexts, claims, clientId, 'read');

/** The monthly fee is a value: the access matrix keeps values from freelancers. */
export function seesFee(actor: Actor): boolean {
  return actor.roles.some(
    (role) => role === 'founder' || role === 'project_manager' || role === 'finance',
  );
}

export const nowOf = (deps: RetainersDeps) => (deps.now ?? (() => new Date()))();
