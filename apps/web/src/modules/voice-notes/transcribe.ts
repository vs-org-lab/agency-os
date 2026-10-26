import { and, eq, inArray } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import type { BucketStorage } from '@/platform/bucket-storage';
import type { DbContexts } from '@/platform/db';
import { voiceNoteContentType } from './domain';

const { organizations, voiceNotes } = schema;

const NO_SPEECH = '';

export type VoiceNoteTranscriber = {
  transcribe(request: {
    bytes: Uint8Array;
    fileName: string;
    contentType: string;
    language: 'pt' | 'en';
  }): Promise<Array<{ text: string }>>;
};

export type VoiceNoteTranscribeDeps = {
  contexts: Pick<DbContexts, 'withSystemContext'>;
  storage: BucketStorage;
  transcription: VoiceNoteTranscriber;
};

/**
 * Transcribes an uploaded note and stores the text. Safe to run again: a note already
 * transcribed is left alone, and a failed one can be retried.
 */
export async function transcribeVoiceNote(
  voiceNoteId: string,
  deps: VoiceNoteTranscribeDeps,
): Promise<'done' | 'skipped'> {
  const note = await deps.contexts.withSystemContext(async (tx) => {
    const [row] = await tx
      .select({
        id: voiceNotes.id,
        path: voiceNotes.path,
        contentType: voiceNotes.contentType,
        status: voiceNotes.status,
        locale: organizations.defaultLocale,
      })
      .from(voiceNotes)
      .innerJoin(organizations, eq(organizations.id, voiceNotes.organizationId))
      .where(eq(voiceNotes.id, voiceNoteId));
    return row ?? null;
  });
  if (!note || !['uploaded', 'failed'].includes(note.status)) return 'skipped';

  const bytes = await deps.storage.download(note.path);
  const segments = await deps.transcription.transcribe({
    bytes,
    fileName: note.path.slice(note.path.lastIndexOf('/') + 1),
    contentType: voiceNoteContentType(note.contentType) ?? 'audio/webm',
    language: note.locale === 'en' ? 'en' : 'pt',
  });
  const transcript =
    segments
      .map((segment) => segment.text.trim())
      .filter((text) => text !== '')
      .join(' ') || NO_SPEECH;

  const updated = await deps.contexts.withSystemContext((tx) =>
    tx
      .update(voiceNotes)
      .set({ status: 'transcribed', transcript })
      .where(
        and(eq(voiceNotes.id, voiceNoteId), inArray(voiceNotes.status, ['uploaded', 'failed'])),
      )
      .returning({ id: voiceNotes.id }),
  );
  return updated.length > 0 ? 'done' : 'skipped';
}

export async function markVoiceNoteFailed(
  voiceNoteId: string,
  deps: Pick<VoiceNoteTranscribeDeps, 'contexts'>,
): Promise<void> {
  await deps.contexts.withSystemContext((tx) =>
    tx
      .update(voiceNotes)
      .set({ status: 'failed' })
      .where(and(eq(voiceNotes.id, voiceNoteId), eq(voiceNotes.status, 'uploaded'))),
  );
}
