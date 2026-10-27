import 'server-only';
import type { VerifiedClaims } from '@/platform/db';
import type { CreateVoiceNoteInput, VoiceNoteTargetKind } from './domain';
import { voiceNoteDeps } from './runtime';
import { confirmVoiceNote, createVoiceNote, listVoiceNotes } from './service';

export function startVoiceNote(claims: VerifiedClaims, input: CreateVoiceNoteInput) {
  return createVoiceNote(claims, input, voiceNoteDeps());
}

export function finishVoiceNote(claims: VerifiedClaims, voiceNoteId: string) {
  return confirmVoiceNote(claims, { voiceNoteId }, voiceNoteDeps());
}

export function loadVoiceNotes(
  claims: VerifiedClaims,
  targetKind: VoiceNoteTargetKind,
  targetIds: string[],
) {
  return listVoiceNotes(claims, { targetKind, targetIds }, voiceNoteDeps());
}

export { VOICE_NOTE_FUNCTIONS } from './automations';
