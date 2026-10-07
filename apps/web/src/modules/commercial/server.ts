import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import type { ApplicationPath } from '@agency-os/db';
import { withSystemContext } from '@/platform/db';
import { commercialEnv } from '@/platform/env';
import { verifyToken } from '@/platform/signed-token';
import type { ApplicationFormDefinition } from './applications/form-definition';
import { getActiveForm } from './applications/forms';
import {
  submitApplication,
  type SubmitApplicationInput,
  type SubmitResult,
} from './applications/submit';

const { commercialSettings, organizations } = schema;

export async function publicOrganizationId(): Promise<string> {
  const slug = commercialEnv().PUBLIC_ORGANIZATION_SLUG;
  const [organization] = await withSystemContext((tx) =>
    tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(eq(organizations.slug, slug), isNull(organizations.archivedAt))),
  );
  if (!organization) throw new Error('Public application organization was not found');
  return organization.id;
}

export async function loadPublicApplicationForm(): Promise<{
  version: number;
  definition: ApplicationFormDefinition;
}> {
  const organizationId = await publicOrganizationId();
  const form = await withSystemContext((tx) => getActiveForm(tx, organizationId));
  return { version: form.version, definition: form.definition };
}

export function submitPublicApplication(input: SubmitApplicationInput): Promise<SubmitResult> {
  const env = commercialEnv();
  return submitApplication(input, {
    contexts: { withSystemContext },
    organizationSlug: env.PUBLIC_ORGANIZATION_SLUG,
    linkSecret: env.PUBLIC_LINK_SECRET,
    now: () => new Date(),
  });
}

export type ThanksView =
  | { path: 'a'; applicationId: string }
  | { path: 'b' }
  | { path: 'c'; selfDiagnosisUrl: string | null }
  | { path: 'generic' };

const PATHS: readonly ApplicationPath[] = ['a', 'b', 'c'];

export async function resolveThanks(token: string | undefined): Promise<ThanksView> {
  if (!token) return { path: 'generic' };
  const data = verifyToken(token, 'apply_thanks', commercialEnv().PUBLIC_LINK_SECRET, new Date());
  const path = data?.path as ApplicationPath | undefined;
  if (!data?.applicationId || !path || !PATHS.includes(path)) return { path: 'generic' };

  if (path === 'a') return { path: 'a', applicationId: data.applicationId };
  if (path === 'b') return { path: 'b' };

  const organizationId = await publicOrganizationId();
  const [settings] = await withSystemContext((tx) =>
    tx
      .select({ url: commercialSettings.selfDiagnosisUrl })
      .from(commercialSettings)
      .where(eq(commercialSettings.organizationId, organizationId)),
  );
  return { path: 'c', selfDiagnosisUrl: settings?.url ?? null };
}

export {
  completeGoogleConnection,
  disconnectGoogleCalendar,
  GOOGLE_CALLBACK_PATH,
  googleOauthCookieName,
  hostCalendar,
  integrationsView,
  isFounder,
  startGoogleConnection,
  type IntegrationsView,
  type StartConnectionResult,
} from './calendar/integration';

export {
  publicBook,
  publicBookingView,
  publicCancel,
  publicReschedule,
  publicSlotList,
  type PublicBookingView,
} from './booking/public';
export type { BookingSource } from './booking/service';
export { COMMERCIAL_FUNCTIONS } from './automations';

export {
  closeFollowUp,
  commercialSession,
  convertTarget,
  loadAcquisition,
  loadApplications,
  loadDealDetail,
  loadPipelineCards,
  loadToday,
  moveDeal,
  recordOutcome,
  reviewApplication,
  saveContact,
  saveTarget,
  scheduleCall,
  updateTracking,
  type CommercialSession,
} from './pipeline/studio';
