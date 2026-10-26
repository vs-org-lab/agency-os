import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createProofFixture,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createMemoryBucketStorage } from '@/platform/bucket-storage-memory';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { MAX_VOICE_NOTE_BYTES } from './domain';
import { confirmVoiceNote, createVoiceNote, listVoiceNotes, type VoiceNoteDeps } from './service';
import { markVoiceNoteFailed, transcribeVoiceNote } from './transcribe';

afterAll(async () => {
  await closeTestSql();
});

function proofClaims(userId: string, userKind: 'internal' | 'client' = 'internal'): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: userKind === 'internal' ? 'aal2' : 'aal1',
    session_id: randomUUID(),
    amr: [
      {
        method: userKind === 'internal' ? 'totp' : 'otp',
        timestamp: Math.floor(Date.now() / 1000),
      },
    ],
    user_kind: userKind,
  };
}

const AUDIO = new Uint8Array([1, 2, 3, 4]);

function setup(sql: TransactionSql) {
  const storage = createMemoryBucketStorage();
  const contexts = createDbContexts(testDatabase(sql));
  const deps: VoiceNoteDeps = { contexts, storage, flush: async () => {} };
  const transcription = {
    async transcribe() {
      return [{ text: ' Mais contraste ' }, { text: 'no logótipo.' }];
    },
  };
  return { storage, contexts, deps, transcription };
}

async function upload(
  deps: VoiceNoteDeps,
  claims: VerifiedClaims,
  targetKind: 'proof_comment' | 'approval_change_request',
  targetId: string,
) {
  const created = await createVoiceNote(
    claims,
    { targetKind, targetId, contentType: 'audio/webm;codecs=opus', durationSeconds: 12 },
    deps,
  );
  if (!created.ok) throw new Error(`Voice note was not created: ${created.rule}`);
  return created;
}

describe('voice notes', () => {
  it('a client attaches a note to its own comment or an open approval only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const { deps } = setup(sql);
      const decider = proofClaims(world.users.decisionMakerA, 'client');
      const create = (
        claims: typeof decider,
        targetKind: 'proof_comment' | 'approval_change_request',
        targetId: string,
        extra: Partial<{ contentType: string; durationSeconds: number }> = {},
      ) =>
        createVoiceNote(
          claims,
          { targetKind, targetId, contentType: 'audio/webm', durationSeconds: 12, ...extra },
          deps,
        );

      const own = await create(decider, 'proof_comment', proof.clientCommentId);
      expect(own).toMatchObject({ ok: true });
      expect(await create(decider, 'proof_comment', proof.clientCommentId)).toEqual({
        ok: false,
        rule: 'duplicate',
      });
      expect(await create(decider, 'approval_change_request', proof.approvalId)).toMatchObject({
        ok: true,
      });

      expect(await create(decider, 'proof_comment', proof.internalCommentId)).toEqual({
        ok: false,
        rule: 'not_found',
      });
      expect(
        await create(
          proofClaims(world.users.operationalA, 'client'),
          'approval_change_request',
          proof.approvalId,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
      expect(
        await create(
          proofClaims(world.users.clientFinanceB, 'client'),
          'proof_comment',
          proof.clientCommentId,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
      expect(
        await create(decider, 'proof_comment', proof.clientCommentId, {
          contentType: 'audio/wav',
        }),
      ).toEqual({ ok: false, rule: 'file_type' });
      expect(
        await create(decider, 'proof_comment', proof.clientCommentId, { durationSeconds: 181 }),
      ).toEqual({ ok: false, rule: 'invalid_input' });

      if (!own.ok) throw new Error('unreachable');
      expect(own.uploadUrl).toContain(`/${proof.rooms.a.projectId}/${own.voiceNoteId}.webm`);
    });
  });

  it('the team attaches a note to its own non-internal and internal comments', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const { deps } = setup(sql);
      const founder = proofClaims(world.users.founder);

      expect(
        await createVoiceNote(
          founder,
          {
            targetKind: 'proof_comment',
            targetId: proof.internalCommentId,
            contentType: 'audio/ogg',
            durationSeconds: 30,
          },
          deps,
        ),
      ).toMatchObject({ ok: true });
      expect(
        await createVoiceNote(
          founder,
          {
            targetKind: 'approval_change_request',
            targetId: proof.approvalId,
            contentType: 'audio/ogg',
            durationSeconds: 30,
          },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });

  it('confirms an upload that is present and within the size limit', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const { deps, storage } = setup(sql);
      const decider = proofClaims(world.users.decisionMakerA, 'client');
      const created = await upload(deps, decider, 'proof_comment', proof.clientCommentId);
      const path = created.uploadUrl.replace('memory://upload/', '');

      expect(await confirmVoiceNote(decider, { voiceNoteId: created.voiceNoteId }, deps)).toEqual({
        ok: false,
        rule: 'upload_missing',
      });
      expect(
        await confirmVoiceNote(
          proofClaims(world.users.operationalA, 'client'),
          { voiceNoteId: created.voiceNoteId },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });

      storage.put(path, AUDIO);
      expect(await confirmVoiceNote(decider, { voiceNoteId: created.voiceNoteId }, deps)).toEqual({
        ok: true,
        status: 'uploaded',
      });
      expect(await confirmVoiceNote(decider, { voiceNoteId: created.voiceNoteId }, deps)).toEqual({
        ok: true,
        status: 'uploaded',
      });
      const [events] = await sql<{ total: number }[]>`
        select count(*)::int as total from public.domain_events
        where organization_id = ${world.organizationId} and type = 'voice_notes.note.uploaded'
      `;
      expect(events?.total).toBe(1);
    });
  });

  it('refuses and removes an upload over the size limit', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const { deps, storage } = setup(sql);
      const decider = proofClaims(world.users.decisionMakerA, 'client');
      const created = await upload(deps, decider, 'proof_comment', proof.clientCommentId);
      const path = created.uploadUrl.replace('memory://upload/', '');
      storage.put(path, new Uint8Array(MAX_VOICE_NOTE_BYTES + 1));

      expect(await confirmVoiceNote(decider, { voiceNoteId: created.voiceNoteId }, deps)).toEqual({
        ok: false,
        rule: 'too_large',
      });
      expect(storage.files.has(path)).toBe(false);
    });
  });

  it('transcribes a note and shows it to the team and to the client, not to another client', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const { deps, storage, contexts, transcription } = setup(sql);
      const decider = proofClaims(world.users.decisionMakerA, 'client');
      const created = await upload(deps, decider, 'proof_comment', proof.clientCommentId);
      storage.put(created.uploadUrl.replace('memory://upload/', ''), AUDIO);
      await confirmVoiceNote(decider, { voiceNoteId: created.voiceNoteId }, deps);

      const list = (claims: typeof decider) =>
        listVoiceNotes(
          claims,
          { targetKind: 'proof_comment', targetIds: [proof.clientCommentId] },
          deps,
        );
      const waiting = await list(proofClaims(world.users.manager));
      expect(waiting).toHaveLength(1);
      expect(waiting[0]).toMatchObject({ status: 'uploaded', transcript: null });

      const transcribeDeps = { contexts, storage, transcription };
      expect(await transcribeVoiceNote(created.voiceNoteId, transcribeDeps)).toBe('done');
      expect(await transcribeVoiceNote(created.voiceNoteId, transcribeDeps)).toBe('skipped');

      const asTeam = await list(proofClaims(world.users.manager));
      expect(asTeam[0]).toMatchObject({
        status: 'transcribed',
        transcript: 'Mais contraste no logótipo.',
        durationSeconds: 12,
      });
      expect(asTeam[0]?.audioUrl).toContain('ttl=900');
      expect(await list(proofClaims(world.users.freelancer))).toEqual([]);
      expect(await list(decider)).toHaveLength(1);
      expect(await list(proofClaims(world.users.operationalA, 'client'))).toHaveLength(1);
      expect(await list(proofClaims(world.users.clientFinanceB, 'client'))).toEqual([]);
    });
  });

  it('marks a note failed when the transcription gives up', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const { deps, storage, contexts } = setup(sql);
      const decider = proofClaims(world.users.decisionMakerA, 'client');
      const created = await upload(deps, decider, 'proof_comment', proof.clientCommentId);
      storage.put(created.uploadUrl.replace('memory://upload/', ''), AUDIO);
      await confirmVoiceNote(decider, { voiceNoteId: created.voiceNoteId }, deps);

      await markVoiceNoteFailed(created.voiceNoteId, { contexts });
      const [row] = await sql<{ status: string }[]>`
        select status from public.voice_notes where id = ${created.voiceNoteId}
      `;
      expect(row?.status).toBe('failed');
    });
  });
});
