import 'server-only';
import { failureHandler, RETRIES } from '@/modules/commercial/server';
import { stepFailure } from '@/modules/diagnosis/server';
import { inngest } from '@/modules/events';
import { withSystemContext } from '@/platform/db';
import { markVoiceNoteFailed, transcribeVoiceNote } from './transcribe';
import { voiceNoteTranscribeDeps } from './runtime';

type UploadedEvent = { organizationId: string; payload: { voiceNoteId?: string } };

/** An uploaded voice note is transcribed so the team reads it as well as hears it. */
const onVoiceNoteUploaded = inngest.createFunction(
  {
    id: 'voice-notes-transcribe',
    triggers: [{ event: 'voice_notes.note.uploaded' }],
    retries: RETRIES,
    onFailure: async (context: {
      error: unknown;
      event: { data: { event?: { data?: unknown } } };
    }) => {
      const original = context.event.data.event?.data as UploadedEvent | undefined;
      const voiceNoteId = original?.payload.voiceNoteId;
      if (voiceNoteId) {
        await markVoiceNoteFailed(voiceNoteId, { contexts: { withSystemContext } });
      }
      await failureHandler('voice-notes-transcribe')(context);
    },
  },
  async ({ event, step }) => {
    const { voiceNoteId } = (event.data as UploadedEvent).payload;
    if (!voiceNoteId) return { result: 'skipped' };
    const result = await step.run('transcribe-voice-note', () =>
      transcribeVoiceNote(voiceNoteId, voiceNoteTranscribeDeps()).catch((error: unknown) => {
        throw stepFailure(error);
      }),
    );
    return { result };
  },
);

export const VOICE_NOTE_FUNCTIONS = [onVoiceNoteUploaded];
