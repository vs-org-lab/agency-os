'use server';

import { withUserContext } from '@/platform/db';
import { getVerifiedClaims } from '@/platform/session';
import { searchWorkspace, type SearchOutcome } from './search';

export async function searchWorkspaceAction(query: string): Promise<SearchOutcome> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, rule: 'forbidden' };
  return searchWorkspace(claims, query, { contexts: { withUserContext } });
}
