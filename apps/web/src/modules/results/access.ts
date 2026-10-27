import { roomActor } from '@/modules/rooms/server';
import type { DbContexts, VerifiedClaims } from '@/platform/db';

export type ResultsDeps = {
  contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'>;
  now?: () => Date;
};

export const NOT_FOUND = { ok: false, rule: 'not_found' } as const;
export const INVALID_INPUT = { ok: false, rule: 'invalid_input' } as const;
export const DUPLICATE_NAME = { ok: false, rule: 'duplicate_name' } as const;

/** The room's writers define the indicators and record their values. */
export const resultsWriter = (claims: VerifiedClaims, clientId: string, deps: ResultsDeps) =>
  roomActor(deps.contexts, claims, clientId, 'write');

export const resultsReader = (claims: VerifiedClaims, clientId: string, deps: ResultsDeps) =>
  roomActor(deps.contexts, claims, clientId, 'read');

export const nowOf = (deps: ResultsDeps) => (deps.now ?? (() => new Date()))();
