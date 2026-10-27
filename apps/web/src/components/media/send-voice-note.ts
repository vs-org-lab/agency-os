import { uploadToSignedUrl } from '@/components/proofing/upload';
import type { VoiceNoteTargetKind } from '@/modules/voice-notes';
import type { Recording } from './use-recorder';

export type VoiceNoteActions = {
  start: (input: {
    targetKind: VoiceNoteTargetKind;
    targetId: string;
    contentType: string;
    durationSeconds: number;
  }) => Promise<{ ok: true; voiceNoteId: string; uploadUrl: string } | { ok: false; code: string }>;
  finish: (voiceNoteId: string) => Promise<{ ok: true } | { ok: false; code: string }>;
};

/** Creates the note, uploads the audio to its signed link and confirms it; false when any step fails. */
export async function sendVoiceNote(
  actions: VoiceNoteActions,
  target: { targetKind: VoiceNoteTargetKind; targetId: string },
  recording: Recording,
): Promise<boolean> {
  const started = await actions
    .start({
      ...target,
      contentType: recording.contentType,
      durationSeconds: recording.durationSeconds,
    })
    .catch(() => null);
  if (!started?.ok) return false;
  const file = new File([recording.blob], 'voice-note', { type: recording.contentType });
  if (!(await uploadToSignedUrl(started.uploadUrl, file))) return false;
  const finished = await actions.finish(started.voiceNoteId).catch(() => null);
  return finished?.ok === true;
}
