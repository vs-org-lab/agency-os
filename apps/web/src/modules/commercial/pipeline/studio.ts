import 'server-only';
import { resolveActor, type Actor } from '@/modules/access';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import { canSeePipeline } from '../access';
import { listPipelineDeals, type PipelineCard, type PipelineFilters } from '../queries';
import type { PipelineCode } from './codes';
import { changeDealStage, type StageChangeResult } from './service';

export type CommercialSession = { claims: VerifiedClaims; actor: Actor };

export async function commercialSession(
  claims: VerifiedClaims | null,
): Promise<CommercialSession | null> {
  if (!claims) return null;
  const actor = await withUserContext(claims, (tx) => resolveActor(tx, claims));
  return actor && canSeePipeline(actor) ? { claims, actor } : null;
}

export function loadPipelineCards(
  session: CommercialSession,
  filters: PipelineFilters,
): Promise<PipelineCard[]> {
  return withUserContext(session.claims, (tx) => listPipelineDeals(tx, filters));
}

export function moveDeal(
  session: CommercialSession,
  input: { dealId: string; to: PipelineCode; reason: string | null },
): Promise<StageChangeResult> {
  return changeDealStage(session.claims, input, {
    contexts: { withUserContext, withSystemContext },
  });
}
