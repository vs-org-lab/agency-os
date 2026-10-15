import { roomActor } from '@/modules/rooms/server';
import type { DbContexts, VerifiedClaims } from '@/platform/db';

export type OutcomesDeps = {
  contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'>;
  now?: () => Date;
  flush?: () => Promise<void>;
};

export type NotFound = { ok: false; rule: 'not_found' };
export const NOT_FOUND: NotFound = { ok: false, rule: 'not_found' };
export const INVALID_INPUT = { ok: false, rule: 'invalid_input' } as const;
export const INVALID_STATE = { ok: false, rule: 'invalid_state' } as const;
export const OK = { ok: true } as const;

/** The room's writers agree the outcome and record its values and the client conditions. */
export const outcomeWriter = (claims: VerifiedClaims, clientId: string, deps: OutcomesDeps) =>
  roomActor(deps.contexts, claims, clientId, 'write');

export const outcomeReader = (claims: VerifiedClaims, clientId: string, deps: OutcomesDeps) =>
  roomActor(deps.contexts, claims, clientId, 'read');

export const nowOf = (deps: OutcomesDeps) => (deps.now ?? (() => new Date()))();

const lisbonDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' });

/** The Lisbon calendar date (YYYY-MM-DD) of an instant, as outcome dates are kept. */
export const lisbonDay = (instant: Date) => lisbonDate.format(instant);
