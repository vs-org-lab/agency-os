import 'server-only';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import { loadStudioFeed } from './feed';
import { loadHome } from './home';

const deps = () => ({ contexts: { withUserContext, withSystemContext } });

export async function loadStudioHome(claims: VerifiedClaims | null, now: Date) {
  return claims ? loadHome(claims, now, deps()) : null;
}

export async function loadStudioUpdates(claims: VerifiedClaims | null, now: Date) {
  return claims ? loadStudioFeed(claims, now, deps()) : null;
}
