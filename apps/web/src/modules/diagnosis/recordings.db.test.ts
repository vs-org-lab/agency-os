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
import { confirmRecordingUpload, createRecording, retryRecording } from './recordings';
import {
  createMemoryRecordingStorage,
  type MemoryRecordingStorage,
} from './transcription/memory-storage';

afterAll(async () => {
  await closeTestSql();
});

function claimsFor(userId: string): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: 'aal2',
    session_id: randomUUID(),
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
  };
}

function depsFor(sql: TransactionSql, storage: MemoryRecordingStorage) {
  return {
    contexts: createDbContexts(testDatabase(sql)),
    storage,
    flush: async () => {},
  };
}

async function uploadedEvents(sql: TransactionSql, recordingId: string): Promise<number> {
  await sql`reset role`;
  const rows = await sql<{ id: string }[]>`
    select id from public.domain_events
    where type = 'core.recording.uploaded' and payload ->> 'recordingId' = ${recordingId}
  `;
  return rows.length;
}

async function recordingStatus(sql: TransactionSql, recordingId: string): Promise<string> {
  await sql`reset role`;
  const [row] = await sql<{ status: string }[]>`
    select status::text from public.core_recordings where id = ${recordingId}
  `;
  return row?.status ?? 'missing';
}

describe('recordings', () => {
  it('consent is required', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const storage = createMemoryRecordingStorage();

      const result = await createRecording(
        claimsFor(world.users.founder),
        {
          engagementId: core.a.engagementId,
          source: 'call',
          consent: false,
          contentType: 'audio/webm',
        },
        depsFor(sql, storage),
      );

      expect(result).toEqual({ ok: false, rule: 'consent_required' });
      await sql`reset role`;
      const rows = await sql`
        select id from public.core_recordings
        where engagement_id = ${core.a.engagementId} and id <> ${core.a.recordingId}
      `;
      expect(rows).toHaveLength(0);
    });
  });

  it('creates upload links for both call tracks', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const storage = createMemoryRecordingStorage();

      const result = await createRecording(
        claimsFor(world.users.founder),
        {
          engagementId: core.a.engagementId,
          source: 'call',
          consent: true,
          contentType: 'audio/webm',
        },
        depsFor(sql, storage),
      );

      if (!result.ok) throw new Error(`Recording was not created: ${result.rule}`);
      const prefix = `${world.organizationId}/${world.clients.a}/${core.a.engagementId}/${result.recordingId}`;
      expect(result.uploads).toEqual([
        { track: 'client', url: `memory://upload/${prefix}/client.webm` },
        { track: 'studio', url: `memory://upload/${prefix}/studio.webm` },
      ]);
      await sql`reset role`;
      const [row] = await sql<
        { status: string; language: string; consent_by: string; studio_track_path: string }[]
      >`
        select status::text, language, consent_by, studio_track_path
        from public.core_recordings where id = ${result.recordingId}
      `;
      expect(row).toEqual({
        status: 'pending_upload',
        language: 'pt',
        consent_by: world.users.founder,
        studio_track_path: `${prefix}/studio.webm`,
      });
      const audits = await sql`
        select id from public.audit_log
        where action = 'core.recording.created' and resource_id = ${result.recordingId}
      `;
      expect(audits).toHaveLength(1);
    });
  });

  it('creates a single track for an uploaded file', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const storage = createMemoryRecordingStorage();

      const result = await createRecording(
        claimsFor(world.users.founder),
        {
          engagementId: core.a.engagementId,
          source: 'upload',
          consent: true,
          contentType: 'audio/mpeg',
        },
        depsFor(sql, storage),
      );

      if (!result.ok) throw new Error(`Recording was not created: ${result.rule}`);
      expect(result.uploads).toHaveLength(1);
      expect(result.uploads[0]?.track).toBe('client');
      expect(result.uploads[0]?.url).toMatch(/\/client\.mp3$/);
    });
  });

  it('rejects an unsupported file type', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);

      const result = await createRecording(
        claimsFor(world.users.founder),
        {
          engagementId: core.a.engagementId,
          source: 'upload',
          consent: true,
          contentType: 'video/mp4',
        },
        depsFor(sql, createMemoryRecordingStorage()),
      );

      expect(result).toEqual({ ok: false, rule: 'file_type' });
    });
  });

  it('confirm without the uploaded file keeps the recording pending', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const storage = createMemoryRecordingStorage();
      const deps = depsFor(sql, storage);
      const claims = claimsFor(world.users.founder);
      const created = await createRecording(
        claims,
        {
          engagementId: core.a.engagementId,
          source: 'call',
          consent: true,
          contentType: 'audio/webm',
        },
        deps,
      );
      if (!created.ok) throw new Error('Recording was not created');
      const [clientUpload] = created.uploads;
      if (!clientUpload) throw new Error('Client upload link missing');
      storage.put(clientUpload.url.replace('memory://upload/', ''), new Uint8Array([1]));

      const result = await confirmRecordingUpload(
        claims,
        { recordingId: created.recordingId },
        deps,
      );

      expect(result).toEqual({ ok: false, rule: 'upload_missing' });
      expect(await recordingStatus(sql, created.recordingId)).toBe('pending_upload');
      expect(await uploadedEvents(sql, created.recordingId)).toBe(0);
    });
  });

  it('confirm with every track uploaded emits the event once', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const storage = createMemoryRecordingStorage();
      const deps = depsFor(sql, storage);
      const claims = claimsFor(world.users.founder);
      const created = await createRecording(
        claims,
        {
          engagementId: core.a.engagementId,
          source: 'call',
          consent: true,
          contentType: 'audio/webm',
        },
        deps,
      );
      if (!created.ok) throw new Error('Recording was not created');
      for (const upload of created.uploads) {
        storage.put(upload.url.replace('memory://upload/', ''), new Uint8Array([1]));
      }

      const first = await confirmRecordingUpload(
        claims,
        { recordingId: created.recordingId },
        deps,
      );
      const second = await confirmRecordingUpload(
        claims,
        { recordingId: created.recordingId },
        deps,
      );

      expect(first).toEqual({ ok: true, status: 'uploaded' });
      expect(second).toEqual({ ok: true, status: 'uploaded' });
      expect(await uploadedEvents(sql, created.recordingId)).toBe(1);
    });
  });

  it('manager of another client gets not_found', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const deps = depsFor(sql, createMemoryRecordingStorage());
      const claims = claimsFor(world.users.manager);

      expect(
        await createRecording(
          claims,
          {
            engagementId: core.b.engagementId,
            source: 'call',
            consent: true,
            contentType: 'audio/webm',
          },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
      expect(
        await confirmRecordingUpload(claims, { recordingId: core.b.recordingId }, deps),
      ).toEqual({ ok: false, rule: 'not_found' });
      expect(await retryRecording(claims, { recordingId: core.b.recordingId }, deps)).toEqual({
        ok: false,
        rule: 'not_found',
      });
    });
  });

  it('retry re-emits only a failed recording', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const deps = depsFor(sql, createMemoryRecordingStorage());
      const claims = claimsFor(world.users.founder);

      expect(await retryRecording(claims, { recordingId: core.a.recordingId }, deps)).toEqual({
        ok: false,
        rule: 'invalid_state',
      });
      await sql`reset role`;
      await sql`
        update public.core_recordings set status = 'failed', error = 'provider_error'
        where id = ${core.a.recordingId}
      `;

      expect(await retryRecording(claims, { recordingId: core.a.recordingId }, deps)).toEqual({
        ok: true,
      });
      expect(await recordingStatus(sql, core.a.recordingId)).toBe('uploaded');
      expect(await uploadedEvents(sql, core.a.recordingId)).toBe(1);
    });
  });
});
