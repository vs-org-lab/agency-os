import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createCoreFixture,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { retryRecording } from './recordings';
import { markRecordingFailed, sweepExpiredRecordings, transcribeRecording } from './transcribe';
import { createMemoryRecordingStorage } from './transcription/memory-storage';
import type { TranscriptionPort, TranscriptionRequest } from './transcription/port';

afterAll(async () => {
  await closeTestSql();
});

const RECORDED_AT = new Date('2026-10-08T13:30:00Z');

function claimsFor(userId: string): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: 'aal2',
    session_id: randomUUID(),
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
  };
}

function scriptedTranscription(requests: TranscriptionRequest[] = []): TranscriptionPort {
  return {
    async transcribe(request) {
      requests.push(request);
      return request.fileName.startsWith('studio')
        ? [{ start: 0, end: 2, text: 'Como vendem hoje?' }]
        : [{ start: 3, end: 6, text: 'Sobretudo online.' }];
    },
  };
}

async function prepareRecording(
  sql: TransactionSql,
  recordingId: string,
  storage: ReturnType<typeof createMemoryRecordingStorage>,
): Promise<string[]> {
  const [row] = await sql<{ client: string; studio: string | null }[]>`
    update public.core_recordings set created_at = ${RECORDED_AT.toISOString()}::timestamptz
    where id = ${recordingId}
    returning client_track_path as client, studio_track_path as studio
  `;
  const paths = [row?.client, row?.studio].filter((path): path is string => Boolean(path));
  for (const path of paths) storage.put(path, new Uint8Array([1, 2, 3]));
  return paths;
}

function depsFor(
  sql: TransactionSql,
  storage: ReturnType<typeof createMemoryRecordingStorage>,
  transcription: TranscriptionPort = scriptedTranscription(),
) {
  return {
    contexts: createDbContexts(testDatabase(sql)),
    storage,
    transcription,
    now: () => new Date('2026-10-08T15:00:00Z'),
  };
}

async function engagementTranscript(sql: TransactionSql, engagementId: string) {
  await sql`reset role`;
  const [row] = await sql<{ transcript: string | null }[]>`
    select transcript from public.core_engagements where id = ${engagementId}
  `;
  return row?.transcript ?? null;
}

const SECTION = [
  '— Gravação de 08/10/2026, 14:30 —',
  '[00:00] Aurion: Como vendem hoje?',
  '[00:03] Cliente: Sobretudo online.',
].join('\n\n');

describe('transcribeRecording', () => {
  it('appends the merged transcript and deletes the audio', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const storage = createMemoryRecordingStorage();
      const paths = await prepareRecording(sql, core.a.recordingId, storage);
      const requests: TranscriptionRequest[] = [];

      const result = await transcribeRecording(
        core.a.recordingId,
        depsFor(sql, storage, scriptedTranscription(requests)),
      );

      expect(result).toBe('done');
      expect(await engagementTranscript(sql, core.a.engagementId)).toBe(`Transcript\n\n${SECTION}`);
      expect(requests.map((request) => [request.fileName, request.language])).toEqual([
        ['client.webm', 'pt'],
        ['studio.webm', 'pt'],
      ]);
      expect(paths.filter((path) => storage.files.has(path))).toEqual([]);
      const [recording] = await sql<{ status: string; transcribed: boolean }[]>`
        select status::text, transcribed_at is not null as transcribed
        from public.core_recordings where id = ${core.a.recordingId}
      `;
      expect(recording).toEqual({ status: 'done', transcribed: true });
      const audits = await sql`
        select id from public.audit_log
        where action = 'core.recording.transcribed' and resource_id = ${core.a.recordingId}
      `;
      expect(audits).toHaveLength(1);
    });
  });

  it('transcribing a done recording does nothing', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const storage = createMemoryRecordingStorage();
      await prepareRecording(sql, core.a.recordingId, storage);
      const deps = depsFor(sql, storage);

      await transcribeRecording(core.a.recordingId, deps);
      const second = await transcribeRecording(core.a.recordingId, deps);

      expect(second).toBe('skipped');
      expect(await engagementTranscript(sql, core.a.engagementId)).toBe(`Transcript\n\n${SECTION}`);
    });
  });

  it('keeps the existing transcript', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const storage = createMemoryRecordingStorage();
      await prepareRecording(sql, core.a.recordingId, storage);
      await sql`
        update public.core_engagements set transcript = 'Notas escritas durante a call.\n'
        where id = ${core.a.engagementId}
      `;

      await transcribeRecording(core.a.recordingId, depsFor(sql, storage));

      expect(await engagementTranscript(sql, core.a.engagementId)).toBe(
        `Notas escritas durante a call.\n\n${SECTION}`,
      );
    });
  });

  it('writes an uploaded file without speaker labels', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const storage = createMemoryRecordingStorage();
      await sql`
        update public.core_recordings set source = 'upload', studio_track_path = null
        where id = ${core.a.recordingId}
      `;
      await sql`update public.core_engagements set transcript = null where id = ${core.a.engagementId}`;
      await prepareRecording(sql, core.a.recordingId, storage);

      await transcribeRecording(core.a.recordingId, depsFor(sql, storage));

      expect(await engagementTranscript(sql, core.a.engagementId)).toBe(
        '— Gravação de 08/10/2026, 14:30 —\n\n[00:03] Sobretudo online.',
      );
    });
  });

  it('notes a recording without speech', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const storage = createMemoryRecordingStorage();
      await prepareRecording(sql, core.a.recordingId, storage);
      const silent: TranscriptionPort = { transcribe: async () => [] };

      await transcribeRecording(core.a.recordingId, depsFor(sql, storage, silent));

      expect(await engagementTranscript(sql, core.a.engagementId)).toBe(
        'Transcript\n\n— Gravação de 08/10/2026, 14:30 —\n\nSem fala reconhecida.',
      );
    });
  });

  it('skips a recording whose upload was never confirmed', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const storage = createMemoryRecordingStorage();
      await sql`update public.core_recordings set status = 'pending_upload' where id = ${core.a.recordingId}`;

      expect(await transcribeRecording(core.a.recordingId, depsFor(sql, storage))).toBe('skipped');
      expect(await engagementTranscript(sql, core.a.engagementId)).toBe('Transcript');
    });
  });

  it('records a failure by its code only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);

      await markRecordingFailed(
        core.a.recordingId,
        'rate_limited',
        depsFor(sql, createMemoryRecordingStorage()),
      );

      await sql`reset role`;
      const [row] = await sql<{ status: string; error: string }[]>`
        select status::text, error from public.core_recordings where id = ${core.a.recordingId}
      `;
      expect(row).toEqual({ status: 'failed', error: 'rate_limited' });
    });
  });
});

describe('sweepExpiredRecordings', () => {
  it('sweep removes audio older than seven days', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const storage = createMemoryRecordingStorage();
      const expired = await prepareRecording(sql, core.a.recordingId, storage);
      const recent = await prepareRecording(sql, core.b.recordingId, storage);
      await sql`
        update public.core_recordings set created_at = ${'2026-09-30T10:00:00Z'}::timestamptz
        where id = ${core.a.recordingId}
      `;
      const deps = depsFor(sql, storage);

      const removed = await sweepExpiredRecordings(deps);

      expect(removed).toBe(1);
      expect(expired.filter((path) => storage.files.has(path))).toEqual([]);
      expect(recent.filter((path) => storage.files.has(path))).toEqual(recent);
      const rows = await sql<{ id: string; status: string; error: string | null }[]>`
        select id, status::text, error from public.core_recordings
        where id in ${sql([core.a.recordingId, core.b.recordingId])}
      `;
      expect(rows.find((row) => row.id === core.a.recordingId)).toMatchObject({
        status: 'failed',
        error: 'expired',
      });
      expect(rows.find((row) => row.id === core.b.recordingId)).toMatchObject({
        status: 'uploaded',
      });
      expect(await sweepExpiredRecordings(deps)).toBe(0);
      expect(
        await retryRecording(
          claimsFor(world.users.founder),
          { recordingId: core.a.recordingId },
          { contexts: deps.contexts, storage, flush: async () => {} },
        ),
      ).toEqual({ ok: false, rule: 'invalid_state' });
    });
  });
});
