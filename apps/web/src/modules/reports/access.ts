import { withActor, type Actor } from '@/modules/access';
import type { DbContexts, VerifiedClaims } from '@/platform/db';

export type ReportsDeps = {
  contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'>;
  now?: () => Date;
};

export const nowOf = (deps: ReportsDeps) => (deps.now ?? (() => new Date()))();

const lisbonDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' });

/** The Lisbon calendar date (YYYY-MM-DD) of an instant. */
export const lisbonDay = (instant: Date) => lisbonDate.format(instant);

/**
 * S-11 joins money, the pipeline and the team's load, which only founders read together
 * (spec 3E.1 §3.1).
 */
export function reportsActor(claims: VerifiedClaims, deps: ReportsDeps): Promise<Actor | null> {
  return withActor(
    deps.contexts,
    claims,
    async (_tx, actor) =>
      actor.mfaVerifiedAt !== null && actor.roles.includes('founder') ? actor : null,
    null,
  );
}
