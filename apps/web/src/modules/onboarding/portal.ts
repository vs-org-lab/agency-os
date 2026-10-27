import { and, eq } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import type { DbContexts, VerifiedClaims } from '@/platform/db';

const { seenMarkers } = schema;

const AREA = 'portal_onboarding';

export type OnboardingDeps = {
  contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'>;
  now?: () => Date;
};

export type OnboardingViewer = { userId: string; organizationId: string };

/**
 * Whether the portal's welcome is still to be shown to this client user. Staff never see it, so
 * a staff preview neither shows it nor records anything.
 */
export async function portalOnboardingPending(
  claims: VerifiedClaims,
  viewer: OnboardingViewer,
  deps: OnboardingDeps,
): Promise<boolean> {
  if (claims.user_kind !== 'client') return false;
  const rows = await deps.contexts.withUserContext(claims, (tx) =>
    tx
      .select({ id: seenMarkers.id })
      .from(seenMarkers)
      .where(
        and(
          eq(seenMarkers.userId, viewer.userId),
          eq(seenMarkers.organizationId, viewer.organizationId),
          eq(seenMarkers.area, AREA),
        ),
      ),
  );
  return rows.length === 0;
}

/**
 * Records that the user saw or skipped the welcome. The marker table only lets organisation
 * members write their own rows, so a client's marker is written in the system context after the
 * caller's own identity and kind were verified.
 */
export async function markPortalOnboardingSeen(
  claims: VerifiedClaims,
  viewer: OnboardingViewer,
  deps: OnboardingDeps,
): Promise<void> {
  if (claims.user_kind !== 'client' || claims.sub !== viewer.userId) return;
  const now = (deps.now ?? (() => new Date()))();
  await deps.contexts.withSystemContext((tx) =>
    tx
      .insert(seenMarkers)
      .values({
        userId: viewer.userId,
        organizationId: viewer.organizationId,
        area: AREA,
        seenAt: now,
      })
      .onConflictDoNothing({
        target: [seenMarkers.userId, seenMarkers.organizationId, seenMarkers.area],
      }),
  );
}
