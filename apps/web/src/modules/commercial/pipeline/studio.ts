import 'server-only';
import type { Locale } from '@agency-os/i18n';
import { resolveActor, type Actor } from '@/modules/access';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import { canSeePipeline } from '../access';
import { recordCallOutcome, scheduleCallManually } from '../calls';
import { hostCalendar } from '../calendar/integration';
import { completeFollowUp, upsertContact, type ContactInput } from '../contacts';
import { getDealDetail, type DealDetail } from '../deal-detail';
import { listApplications, type ApplicationRow } from '../applications/list';
import { reviewQueueB } from '../applications/review';
import { listPipelineDeals, type PipelineCard, type PipelineFilters } from '../queries';
import type { PipelineCode } from './codes';
import {
  changeDealStage,
  updateDealTracking,
  type DealTrackingInput,
  type StageChangeResult,
} from './service';

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

export function loadDealDetail(
  session: CommercialSession,
  dealId: string,
  locale: Locale,
): Promise<DealDetail | null> {
  return withUserContext(session.claims, (tx) => getDealDetail(tx, dealId, locale));
}

const userContexts = { withUserContext, withSystemContext };

export function updateTracking(session: CommercialSession, input: DealTrackingInput) {
  return updateDealTracking(session.claims, input, { contexts: userContexts });
}

export function recordOutcome(
  session: CommercialSession,
  input: Parameters<typeof recordCallOutcome>[1],
) {
  return recordCallOutcome(session.claims, input, {
    contexts: userContexts,
    calendar: hostCalendar,
  });
}

export function scheduleCall(
  session: CommercialSession,
  input: Parameters<typeof scheduleCallManually>[1],
) {
  return scheduleCallManually(session.claims, input, {
    contexts: userContexts,
    calendar: hostCalendar,
  });
}

export function saveContact(session: CommercialSession, input: ContactInput) {
  return upsertContact(session.claims, input, { contexts: userContexts });
}

export function closeFollowUp(
  session: CommercialSession,
  input: { followUpId: string; status: 'done' | 'dismissed' },
) {
  return completeFollowUp(session.claims, input, { contexts: userContexts });
}

export function loadApplications(
  session: CommercialSession,
  input: { tab: 'all' | 'queue_b'; search?: string },
): Promise<ApplicationRow[]> {
  return withUserContext(session.claims, (tx) => listApplications(tx, input));
}

export function reviewApplication(
  session: CommercialSession,
  input: { applicationId: string; decision: 'a' | 'c' },
) {
  return reviewQueueB(session.claims, input, { contexts: userContexts });
}
