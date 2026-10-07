import 'server-only';
import { eq } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import type { Locale } from '@agency-os/i18n';
import { resolveActor, type Actor } from '@/modules/access';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import { canSeePipeline } from '../access';
import { recordCallOutcome, scheduleCallManually } from '../calls';
import { hostCalendar } from '../calendar/integration';
import { completeFollowUp, upsertContact, type ContactInput } from '../contacts';
import { getDealDetail, type DealDetail } from '../deal-detail';
import { listTodayItems, type TodayItem } from '../today';
import {
  getCommercialSettings,
  listMessageTemplates,
  publishApplicationForm,
  saveMessageTemplate,
  updateBookingSettings,
  type BookingSettingsInput,
  type TemplateInput,
} from '../settings/service';
import { getActiveForm } from '../applications/forms';
import type { ApplicationFormDefinition } from '../applications/form-definition';
import { listApplications, type ApplicationRow } from '../applications/list';
import { reviewQueueB } from '../applications/review';
import {
  convertAcquisitionTarget,
  listAcquisitionTargets,
  listAcquisitionTemplates,
  saveAcquisitionTarget,
  type TargetInput,
} from '../acquisition/service';
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

export function loadAcquisition(session: CommercialSession) {
  return withUserContext(session.claims, async (tx) => ({
    targets: await listAcquisitionTargets(tx),
    templates: await listAcquisitionTemplates(tx),
  }));
}

export function saveTarget(session: CommercialSession, input: TargetInput) {
  return saveAcquisitionTarget(session.claims, input, { contexts: userContexts });
}

export function convertTarget(
  session: CommercialSession,
  input: Parameters<typeof convertAcquisitionTarget>[1],
) {
  return convertAcquisitionTarget(session.claims, input, { contexts: userContexts });
}

export function loadToday(session: CommercialSession, now: Date): Promise<TodayItem[]> {
  return withUserContext(session.claims, async (tx) => {
    const [settings] = await tx
      .select({ timeZone: schema.commercialSettings.timeZone })
      .from(schema.commercialSettings)
      .where(eq(schema.commercialSettings.organizationId, session.actor.organizationId));
    return listTodayItems(tx, { now, timeZone: settings?.timeZone ?? 'Europe/Lisbon' });
  });
}

export function loadSettingsData(session: CommercialSession) {
  return withUserContext(session.claims, async (tx) => ({
    settings: await getCommercialSettings(tx, session.actor.organizationId),
    templates: await listMessageTemplates(tx),
  }));
}

export function loadActiveForm(session: CommercialSession) {
  return withUserContext(session.claims, (tx) => getActiveForm(tx, session.actor.organizationId));
}

export function saveBookingSettings(session: CommercialSession, input: BookingSettingsInput) {
  return updateBookingSettings(session.claims, input, { contexts: userContexts });
}

export function publishForm(session: CommercialSession, definition: ApplicationFormDefinition) {
  return publishApplicationForm(session.claims, definition, { contexts: userContexts });
}

export function saveTemplate(session: CommercialSession, input: TemplateInput) {
  return saveMessageTemplate(session.claims, input, { contexts: userContexts });
}
