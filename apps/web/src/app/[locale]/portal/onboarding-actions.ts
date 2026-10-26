'use server';

import { resolveActor } from '@/modules/access';
import { recordPortalOnboardingSeen } from '@/modules/onboarding/server';
import { withUserContext } from '@/platform/db';
import { getVerifiedClaims } from '@/platform/session';

/** Records that the signed-in client user saw or skipped the portal welcome. */
export async function dismissPortalOnboardingAction(): Promise<void> {
  const claims = await getVerifiedClaims();
  if (!claims) return;
  const actor = await withUserContext(claims, (tx) => resolveActor(tx, claims));
  if (!actor) return;
  await recordPortalOnboardingSeen(claims, {
    userId: actor.userId,
    organizationId: actor.organizationId,
  });
}
