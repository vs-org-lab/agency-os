'use server';

import { revalidatePath } from 'next/cache';
import { commercialSession } from '@/modules/commercial/server';
import {
  confirmCoreRecording,
  retryCoreRecording,
  startCoreRecording,
} from '@/modules/diagnosis/server';
import { getVerifiedClaims } from '@/platform/session';

export type RecordingUpload = { track: 'client' | 'studio'; url: string };

export type StartRecordingResult =
  { ok: true; recordingId: string; uploads: RecordingUpload[] } | { ok: false; code: string };

export type RecordingActionResult = { ok: true } | { ok: false; code: string };

async function session() {
  return commercialSession(await getVerifiedClaims());
}

function refresh(dealId: string) {
  revalidatePath(`/pipeline/${dealId}`);
  revalidatePath(`/pipeline/${dealId}/core/call`);
}

export async function startRecordingAction(
  engagementId: string,
  input: { source: 'call' | 'upload'; consent: boolean; contentType: string },
): Promise<StartRecordingResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  const result = await startCoreRecording(current, { engagementId, ...input });
  return result.ok
    ? { ok: true, recordingId: result.recordingId, uploads: result.uploads }
    : { ok: false, code: result.rule };
}

export async function confirmRecordingAction(
  recordingId: string,
  dealId: string,
): Promise<RecordingActionResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  const result = await confirmCoreRecording(current, { recordingId });
  if (!result.ok) return { ok: false, code: result.rule };
  refresh(dealId);
  return { ok: true };
}

export async function retryRecordingAction(
  recordingId: string,
  dealId: string,
): Promise<RecordingActionResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  const result = await retryCoreRecording(current, { recordingId });
  if (!result.ok) return { ok: false, code: result.rule };
  refresh(dealId);
  return { ok: true };
}
