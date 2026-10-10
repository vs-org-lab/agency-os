import { withActor, type Actor } from '@/modules/access';
import type { DbContexts, VerifiedClaims } from '@/platform/db';

/** "Permissões e utilizadores" in the access matrix: founders read and write, nobody else. */
export function founderActor(
  contexts: Pick<DbContexts, 'withUserContext'>,
  claims: VerifiedClaims,
): Promise<Actor | null> {
  return withActor(
    contexts,
    claims,
    async (_tx, actor) =>
      actor.mfaVerifiedAt !== null && actor.roles.includes('founder') ? actor : null,
    null,
  );
}
