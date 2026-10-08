import { and, eq, inArray, isNull, lt, ne, or } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import type { DbContexts } from '@/platform/db';
import {
  appendTranscriptSection,
  mergeTracks,
  transcriptSection,
  type TranscriptSegment,
} from './transcription/merge';
import type { TranscriptionLanguage, TranscriptionPort } from './transcription/port';
import { contentTypeForPath, type RecordingStorage } from './transcription/storage';

const { coreEngagements, coreRecordings } = schema;

export const RECORDING_RETENTION_DAYS = 7;
export const EXPIRED_RECORDING_ERROR = 'expired';

const STUDIO_TIME_ZONE = 'Europe/Lisbon';
const STUDIO_SPEAKER = 'Aurion';
const CLIENT_SPEAKER = 'Cliente';
const NO_SPEECH = 'Sem fala reconhecida.';

export type TranscribeDeps = {
  contexts: Pick<DbContexts, 'withSystemContext'>;
  storage: RecordingStorage;
  transcription: TranscriptionPort;
  now: () => Date;
};

type RecordingRow = {
  id: string;
  organizationId: string;
  clientId: string;
  engagementId: string;
  source: 'call' | 'upload';
  status: string;
  clientTrackPath: string;
  studioTrackPath: string | null;
  language: string;
  createdAt: Date;
};

function trackPaths(
  recording: Pick<RecordingRow, 'clientTrackPath' | 'studioTrackPath'>,
): string[] {
  return [recording.clientTrackPath, recording.studioTrackPath].filter(
    (path): path is string => path !== null,
  );
}

function sectionHeader(recordedAt: Date): string {
  const label = new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: STUDIO_TIME_ZONE,
  }).format(recordedAt);
  return `Gravação de ${label}`;
}

async function lockRecording(tx: DbTransaction, recordingId: string): Promise<RecordingRow | null> {
  const [recording] = await tx
    .select({
      id: coreRecordings.id,
      organizationId: coreRecordings.organizationId,
      clientId: coreRecordings.clientId,
      engagementId: coreRecordings.engagementId,
      source: coreRecordings.source,
      status: coreRecordings.status,
      clientTrackPath: coreRecordings.clientTrackPath,
      studioTrackPath: coreRecordings.studioTrackPath,
      language: coreRecordings.language,
      createdAt: coreRecordings.createdAt,
    })
    .from(coreRecordings)
    .where(eq(coreRecordings.id, recordingId))
    .for('update');
  return recording ?? null;
}

export type TranscriptionJob = {
  recordingId: string;
  language: TranscriptionLanguage;
  header: string;
  tracks: Array<{ path: string; speaker: string | null }>;
};

/**
 * Claims an uploaded recording for transcription. Returns null when there is nothing to do; a
 * recording already done only has its leftover audio removed.
 */
export async function startTranscription(
  recordingId: string,
  deps: TranscribeDeps,
): Promise<TranscriptionJob | null> {
  const recording = await deps.contexts.withSystemContext(async (tx) => {
    const locked = await lockRecording(tx, recordingId);
    if (!locked || !['uploaded', 'transcribing', 'failed'].includes(locked.status)) return locked;
    await tx
      .update(coreRecordings)
      .set({ status: 'transcribing', error: null })
      .where(eq(coreRecordings.id, recordingId));
    return { ...locked, status: 'transcribing' };
  });
  if (!recording) return null;
  if (recording.status === 'done') {
    await deps.storage.remove(trackPaths(recording));
    return null;
  }
  if (recording.status !== 'transcribing') return null;

  const labelled = recording.source === 'call';
  const tracks: TranscriptionJob['tracks'] = [
    { path: recording.clientTrackPath, speaker: labelled ? CLIENT_SPEAKER : null },
  ];
  if (recording.studioTrackPath) {
    tracks.push({ path: recording.studioTrackPath, speaker: STUDIO_SPEAKER });
  }
  return {
    recordingId,
    language: recording.language === 'en' ? 'en' : 'pt',
    header: sectionHeader(recording.createdAt),
    tracks,
  };
}

export async function transcribeTrack(
  job: TranscriptionJob,
  index: number,
  deps: Pick<TranscribeDeps, 'storage' | 'transcription'>,
): Promise<TranscriptSegment[]> {
  const track = job.tracks[index];
  if (!track) throw new Error(`Recording ${job.recordingId} has no track ${index}`);
  const bytes = await deps.storage.download(track.path);
  return deps.transcription.transcribe({
    bytes,
    fileName: track.path.slice(track.path.lastIndexOf('/') + 1),
    contentType: contentTypeForPath(track.path),
    language: job.language,
  });
}

/** Appends the merged tracks to the Core transcript exactly once, then deletes the audio. */
export async function finishTranscription(
  job: TranscriptionJob,
  segments: TranscriptSegment[][],
  deps: TranscribeDeps,
): Promise<'done' | 'skipped'> {
  const body =
    mergeTracks(
      job.tracks.map((track, index) => ({
        speaker: track.speaker,
        segments: segments[index] ?? [],
      })),
    ) || NO_SPEECH;
  const section = transcriptSection(job.header, body);

  const appended = await deps.contexts.withSystemContext(async (tx) => {
    const locked = await lockRecording(tx, job.recordingId);
    if (!locked || locked.status === 'done') return false;
    const [engagement] = await tx
      .select({ transcript: coreEngagements.transcript })
      .from(coreEngagements)
      .where(eq(coreEngagements.id, locked.engagementId))
      .for('update');
    if (!engagement) return false;

    await tx
      .update(coreEngagements)
      .set({ transcript: appendTranscriptSection(engagement.transcript, section) })
      .where(eq(coreEngagements.id, locked.engagementId));
    await tx
      .update(coreRecordings)
      .set({ status: 'done', error: null, transcribedAt: deps.now() })
      .where(eq(coreRecordings.id, job.recordingId));
    await recordAudit(tx, {
      organizationId: locked.organizationId,
      action: 'core.recording.transcribed',
      resourceType: 'core_recording',
      resourceId: job.recordingId,
      clientId: locked.clientId,
      metadata: { engagementId: locked.engagementId },
    });
    return true;
  });

  await deps.storage.remove(job.tracks.map((track) => track.path));
  return appended ? 'done' : 'skipped';
}

/**
 * Transcribes an uploaded recording in one run. Safe to run again for the same recording: the
 * transcript is appended under a row lock exactly once.
 */
export async function transcribeRecording(
  recordingId: string,
  deps: TranscribeDeps,
): Promise<'done' | 'skipped'> {
  const job = await startTranscription(recordingId, deps);
  if (!job) return 'skipped';
  const segments: TranscriptSegment[][] = [];
  for (let index = 0; index < job.tracks.length; index += 1) {
    segments.push(await transcribeTrack(job, index, deps));
  }
  return finishTranscription(job, segments, deps);
}

export async function markRecordingFailed(
  recordingId: string,
  errorCode: string,
  deps: Pick<TranscribeDeps, 'contexts'>,
): Promise<void> {
  await deps.contexts.withSystemContext((tx) =>
    tx
      .update(coreRecordings)
      .set({ status: 'failed', error: errorCode })
      .where(and(eq(coreRecordings.id, recordingId), ne(coreRecordings.status, 'done'))),
  );
}

/** Deletes the audio of every recording left untranscribed past the retention window. */
export async function sweepExpiredRecordings(
  deps: Pick<TranscribeDeps, 'contexts' | 'storage' | 'now'>,
): Promise<number> {
  const cutoff = new Date(deps.now().getTime() - RECORDING_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const expired = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({
        id: coreRecordings.id,
        clientTrackPath: coreRecordings.clientTrackPath,
        studioTrackPath: coreRecordings.studioTrackPath,
      })
      .from(coreRecordings)
      .where(
        and(
          ne(coreRecordings.status, 'done'),
          lt(coreRecordings.createdAt, cutoff),
          or(isNull(coreRecordings.error), ne(coreRecordings.error, EXPIRED_RECORDING_ERROR)),
        ),
      ),
  );
  if (expired.length === 0) return 0;

  await deps.storage.remove(expired.flatMap(trackPaths));
  await deps.contexts.withSystemContext((tx) =>
    tx
      .update(coreRecordings)
      .set({ status: 'failed', error: EXPIRED_RECORDING_ERROR })
      .where(
        and(
          inArray(
            coreRecordings.id,
            expired.map((recording) => recording.id),
          ),
          ne(coreRecordings.status, 'done'),
        ),
      ),
  );
  return expired.length;
}
