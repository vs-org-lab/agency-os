import 'server-only';
import { transcribesInline, transcriptionPort } from '@/modules/diagnosis/server';
import { withSystemContext, withUserContext } from '@/platform/db';
import { createSupabaseBucketStorage } from '@/platform/supabase-bucket-storage';
import { VOICE_NOTES_BUCKET } from './domain';
import type { VoiceNoteDeps } from './service';
import { transcribeVoiceNote, type VoiceNoteTranscribeDeps } from './transcribe';

export function voiceNoteTranscribeDeps(): VoiceNoteTranscribeDeps {
  return {
    contexts: { withSystemContext },
    storage: createSupabaseBucketStorage(VOICE_NOTES_BUCKET),
    transcription: transcriptionPort(),
  };
}

export function voiceNoteDeps(): VoiceNoteDeps {
  return {
    contexts: { withUserContext, withSystemContext },
    storage: createSupabaseBucketStorage(VOICE_NOTES_BUCKET),
    // Previews and end-to-end runs have no background worker, so the fake provider runs here.
    afterUpload: transcribesInline()
      ? async (voiceNoteId) => {
          await transcribeVoiceNote(voiceNoteId, voiceNoteTranscribeDeps());
        }
      : undefined,
  };
}
