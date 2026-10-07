'use server';

import { revalidatePath } from 'next/cache';
import {
  commercialSession,
  loadUnseenApplicationsCount,
  recordApplicationsSeen,
  reviewApplication,
} from '@/modules/commercial/server';
import { getVerifiedClaims } from '@/platform/session';

export type ReviewActionState =
  | { status: 'idle' }
  | { status: 'approved' | 'rejected' }
  | { status: 'error'; code: 'already_reviewed' | 'not_found' | 'stage_refused' };

export async function reviewApplicationAction(
  applicationId: string,
  decision: 'a' | 'c',
): Promise<ReviewActionState> {
  const session = await commercialSession(await getVerifiedClaims());
  if (!session) return { status: 'error', code: 'not_found' };
  const result = await reviewApplication(session, { applicationId, decision });
  if (!result.ok) return { status: 'error', code: result.rule };
  revalidatePath('/applications');
  revalidatePath('/pipeline');
  return { status: decision === 'a' ? 'approved' : 'rejected' };
}

export async function unseenApplicationsAction(): Promise<number> {
  const session = await commercialSession(await getVerifiedClaims());
  return session ? loadUnseenApplicationsCount(session) : 0;
}

export async function markApplicationsSeenAction(): Promise<void> {
  const session = await commercialSession(await getVerifiedClaims());
  if (session) await recordApplicationsSeen(session);
}
