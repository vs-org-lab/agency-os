'use server';

import { revalidatePath } from 'next/cache';
import type { CreateVoiceNoteInput } from '@/modules/voice-notes';
import { finishVoiceNote, startVoiceNote } from '@/modules/voice-notes/server';
import { getVerifiedClaims } from '@/platform/session';

export type StartVoiceNoteResult =
  { ok: true; voiceNoteId: string; uploadUrl: string } | { ok: false; code: string };

export async function startVoiceNoteAction(
  input: CreateVoiceNoteInput,
): Promise<StartVoiceNoteResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await startVoiceNote(claims, input);
  return result.ok
    ? { ok: true, voiceNoteId: result.voiceNoteId, uploadUrl: result.uploadUrl }
    : { ok: false, code: result.rule };
}

export async function finishVoiceNoteAction(
  voiceNoteId: string,
): Promise<{ ok: true } | { ok: false; code: string }> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await finishVoiceNote(claims, voiceNoteId);
  if (!result.ok) return { ok: false, code: result.rule };
  revalidatePath('/', 'layout');
  return { ok: true };
}
