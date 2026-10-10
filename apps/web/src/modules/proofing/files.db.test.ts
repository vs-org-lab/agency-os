import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createProofFixture,
  createRoomFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { addProofVersion, confirmProofVersion, createProofFile, proofFileUrl } from './files';
import { PNG_BYTES, proofClaims, proofingDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

describe('proof files', () => {
  it('manager creates a proof and confirms an image', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const rooms = await createRoomFixture(sql, world);
      const { deps, storage } = proofingDeps(sql);
      const manager = proofClaims(world.users.manager);

      const created = await createProofFile(
        manager,
        { projectId: rooms.a.projectId, title: 'Logótipo' },
        deps,
      );
      if (!created.ok) throw new Error('Proof was not created');
      expect(created.uploadUrl).toContain('memory://upload/');
      const path = created.uploadUrl.replace('memory://upload/', '');
      storage.files.set(path, PNG_BYTES);

      expect(await confirmProofVersion(manager, { versionId: created.versionId }, deps)).toEqual({
        ok: true,
        kind: 'image',
      });
      const [row] = await sql<{ status: string; mime_type: string; number: number }[]>`
        select status::text, mime_type, number from public.proof_versions
        where id = ${created.versionId}
      `;
      expect(row).toEqual({ status: 'ready', mime_type: 'image/png', number: 1 });

      const next = await addProofVersion(manager, { fileId: created.fileId }, deps);
      expect(next.ok && next.uploadUrl).toBeTruthy();
      const [second] = await sql<{ number: number }[]>`
        select number from public.proof_versions where id = ${next.ok ? next.versionId : ''}
      `;
      expect(second?.number).toBe(2);
    });
  });

  it('a spoofed file is rejected and removed', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const rooms = await createRoomFixture(sql, world);
      const { deps, storage } = proofingDeps(sql);
      const founder = proofClaims(world.users.founder);
      const created = await createProofFile(
        founder,
        { projectId: rooms.a.projectId, title: 'Fotografia' },
        deps,
      );
      if (!created.ok) throw new Error('Proof was not created');
      const path = created.uploadUrl.replace('memory://upload/', '');
      storage.files.set(path, new TextEncoder().encode('<html><script>alert(1)</script></html>'));

      expect(await confirmProofVersion(founder, { versionId: created.versionId }, deps)).toEqual({
        ok: false,
        rule: 'invalid_file',
      });
      expect(storage.removed).toEqual([path]);
      const [row] = await sql<{ status: string }[]>`
        select status::text from public.proof_versions where id = ${created.versionId}
      `;
      expect(row?.status).toBe('rejected');
    });
  });

  it('freelancers cannot upload', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const rooms = await createRoomFixture(sql, world);
      const { deps } = proofingDeps(sql);

      expect(
        await createProofFile(
          proofClaims(world.users.freelancer),
          { projectId: rooms.a.projectId, title: 'Peça' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
      expect(
        await createProofFile(
          proofClaims(world.users.manager),
          { projectId: rooms.b.projectId, title: 'Peça' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });

  it('signed links only for readers', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const { deps } = proofingDeps(sql);

      expect(
        await proofFileUrl(proofClaims(world.users.manager), proof.versionOneId, deps),
      ).toContain('ttl=900');
      expect(
        await proofFileUrl(
          proofClaims(world.users.decisionMakerA, 'client'),
          proof.versionTwoId,
          deps,
        ),
      ).toContain('ttl=900');
      expect(
        await proofFileUrl(
          proofClaims(world.users.decisionMakerA, 'client'),
          proof.versionOneId,
          deps,
        ),
      ).toBeNull();
      expect(
        await proofFileUrl(proofClaims(world.users.freelancer), proof.versionOneId, deps),
      ).toBeNull();
    });
  });
});
