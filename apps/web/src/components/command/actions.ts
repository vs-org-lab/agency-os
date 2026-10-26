'use server';

import { withUserContext } from '@/platform/db';
import { getVerifiedClaims } from '@/platform/session';
import { searchWorkspace, type SearchOutcome } from './search';

export async function searchWorkspaceAction(query: string): Promise<SearchOutcome> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, rule: 'forbidden' };
  // A failing query carries the search term in its error; it must not reach logs or Sentry.
  try {
    return await searchWorkspace(claims, query, { contexts: { withUserContext } });
  } catch {
    return { ok: false, rule: 'unavailable' };
  }
}
