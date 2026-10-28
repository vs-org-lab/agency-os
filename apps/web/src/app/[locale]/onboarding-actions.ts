'use server';

import {
  onboardingFolder,
  reopenOnboardingRequest,
  respondOnboarding,
} from '@/modules/client-onboarding/server';
import { getVerifiedClaims } from '@/platform/session';

export type OnboardingActionResult = { ok: true } | { ok: false; code: string };

/** The client answers or confirms one onboarding request. */
export async function respondOnboardingAction(
  clientId: string,
  requestId: string,
  response: string,
): Promise<OnboardingActionResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await respondOnboarding(claims, { clientId, requestId, response });
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}

/** The library folder the client's files for an upload request go to, created the first time. */
export async function onboardingFolderAction(
  clientId: string,
  requestId: string,
): Promise<{ ok: true; folderId: string } | { ok: false; code: string }> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const folderId = await onboardingFolder(claims, { clientId, requestId });
  return folderId ? { ok: true, folderId } : { ok: false, code: 'not_found' };
}

/** The room's team asks the client again for a request already answered. */
export async function reopenOnboardingAction(
  clientId: string,
  requestId: string,
): Promise<OnboardingActionResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await reopenOnboardingRequest(claims, { clientId, requestId });
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}
