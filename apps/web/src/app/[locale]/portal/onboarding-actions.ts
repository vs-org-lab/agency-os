'use server';

import { resolveActor } from '@/modules/access';
import { recordPortalOnboardingSeen, type PortalSeenArea } from '@/modules/onboarding/server';
import { withUserContext } from '@/platform/db';
import { getVerifiedClaims } from '@/platform/session';

async function recordSeen(area: PortalSeenArea): Promise<void> {
  const claims = await getVerifiedClaims();
  if (!claims) return;
  const actor = await withUserContext(claims, (tx) => resolveActor(tx, claims));
  if (!actor) return;
  await recordPortalOnboardingSeen(
    claims,
    { userId: actor.userId, organizationId: actor.organizationId },
    area,
  );
}

/** Records that the signed-in client user finished or skipped the guided tour. */
export async function dismissPortalOnboardingAction(): Promise<void> {
  await recordSeen('portal_onboarding');
}

/** Records that the signed-in client user hid the getting-started list. */
export async function hideGettingStartedAction(): Promise<void> {
  await recordSeen('portal_getting_started');
}
