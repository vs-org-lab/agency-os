import { canReadBilling } from '@/modules/billing';
import { roomActor } from '@/modules/rooms/server';
import type { DbContexts, VerifiedClaims } from '@/platform/db';

export type HealthDeps = {
  contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'>;
  now?: () => Date;
  flush?: () => Promise<void>;
};

export const nowOf = (deps: HealthDeps) => (deps.now ?? (() => new Date()))();

const lisbonDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' });

/** The Lisbon calendar date (YYYY-MM-DD) of an instant. */
export const lisbonDay = (instant: Date) => lisbonDate.format(instant);

/**
 * The health uses payment requests, which the access matrix keeps from freelancers (08): it is
 * read by the room's readers who also read billing.
 */
export async function healthReader(claims: VerifiedClaims, clientId: string, deps: HealthDeps) {
  const reader = await roomActor(deps.contexts, claims, clientId, 'read');
  return reader && canReadBilling(reader) ? reader : null;
}
