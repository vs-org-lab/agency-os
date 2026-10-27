import 'server-only';
import { withSystemContext } from '@/platform/db';
import { transcriptionEnv } from '@/platform/env';
import type { TranscribeDeps } from './transcribe';
import { createFakeTranscription } from './transcription/fake';
import { createGroqTranscription } from './transcription/groq';
import type { TranscriptionPort } from './transcription/port';
import { createSupabaseRecordingStorage } from './transcription/supabase-storage';

export function transcriptionPort(): TranscriptionPort {
  const env = transcriptionEnv();
  return env.TRANSCRIPTION_PROVIDER === 'groq'
    ? createGroqTranscription({ apiKey: env.GROQ_API_KEY })
    : createFakeTranscription();
}

export function transcribeDeps(): TranscribeDeps {
  return {
    contexts: { withSystemContext },
    storage: createSupabaseRecordingStorage(),
    transcription: transcriptionPort(),
    now: () => new Date(),
  };
}

/**
 * The fake provider backs previews and end-to-end runs, where no background worker is synced,
 * so the transcription runs in the request that confirms the upload.
 */
export function transcribesInline(): boolean {
  return transcriptionEnv().TRANSCRIPTION_PROVIDER === 'fake';
}
