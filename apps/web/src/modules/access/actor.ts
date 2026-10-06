import 'server-only';
import { withUserContext } from '@/platform/db';
import { getVerifiedClaims } from '@/platform/session';
import { resolveActor } from './scope';
import type { Actor } from './types';

export async function getActor(): Promise<Actor | null> {
  const claims = await getVerifiedClaims();
  if (!claims) return null;
  return withUserContext(claims, (tx) => resolveActor(tx, claims));
}
