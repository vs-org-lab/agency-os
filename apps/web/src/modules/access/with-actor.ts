import type { DbTransaction } from '@agency-os/db';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { resolveActor } from './scope';
import type { Actor } from './types';

export function withActor<T>(
  contexts: Pick<DbContexts, 'withUserContext'>,
  claims: VerifiedClaims,
  fn: (tx: DbTransaction, actor: Actor) => Promise<T>,
  onMissingActor: T,
): Promise<T> {
  return contexts.withUserContext(claims, async (tx) => {
    const actor = await resolveActor(tx, claims);
    return actor ? fn(tx, actor) : onMissingActor;
  });
}
