'use server';

import type { AcademyResult } from '@/components/academy/shared';
import type { ItemSource, SessionInput } from '@/modules/academy';
import {
  changeAcademyItemStatus,
  markAcademyStep,
  removeAcademyItem,
  removeTrainingSession,
  reorderAcademyItem,
  storeAcademyItem,
  storeTrainingSession,
} from '@/modules/academy/server';
import { getVerifiedClaims } from '@/platform/session';

type Claims = NonNullable<Awaited<ReturnType<typeof getVerifiedClaims>>>;
type Failure = { ok: false; code: string };

async function run<T extends { ok: true }>(
  action: (claims: Claims) => Promise<T | { ok: false; rule: string }>,
): Promise<T | Failure> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await action(claims);
  return result.ok ? result : { ok: false, code: result.rule };
}

export async function saveAcademyItemAction(input: {
  clientId: string;
  itemId?: string;
  kind: string;
  title: string;
  description: string;
  source: ItemSource | null;
  steps: string[];
}) {
  return run<{ ok: true; itemId: string }>((claims) => storeAcademyItem(claims, input));
}

export async function setAcademyItemStatusAction(input: {
  itemId: string;
  status: 'draft' | 'published';
}): Promise<AcademyResult> {
  return run((claims) => changeAcademyItemStatus(claims, input));
}

export async function deleteAcademyItemAction(input: { itemId: string }): Promise<AcademyResult> {
  return run((claims) => removeAcademyItem(claims, input.itemId));
}

export async function moveAcademyItemAction(input: {
  itemId: string;
  direction: 'up' | 'down';
}): Promise<AcademyResult> {
  return run((claims) => reorderAcademyItem(claims, input));
}

export async function checkAcademyStepAction(input: {
  stepId: string;
  done: boolean;
}): Promise<AcademyResult> {
  return run((claims) => markAcademyStep(claims, input));
}

export async function saveTrainingSessionAction(
  input: { clientId: string; sessionId?: string } & SessionInput,
) {
  return run<{ ok: true; sessionId: string }>((claims) => storeTrainingSession(claims, input));
}

export async function deleteTrainingSessionAction(input: {
  sessionId: string;
}): Promise<AcademyResult> {
  return run((claims) => removeTrainingSession(claims, input.sessionId));
}
