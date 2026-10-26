import { sql as drizzleSql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createProofFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { approvalNotice, getClientApprovals } from '@/modules/rooms';
import { proofCommentNotice } from './notices';
import { getClientProofs, getClientProofVersion } from './portal';
import { proofClaims, proofingDeps } from './testing';
import { loadProofs, loadProofVersion } from './views';

afterAll(async () => {
  await closeTestSql();
});

describe('proof views', () => {
  it('team view lists versions and comments', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const { deps } = proofingDeps(sql);
      const manager = proofClaims(world.users.manager);

      const files = await loadProofs(
        manager,
        { clientId: world.clients.a, projectId: proof.rooms.a.projectId },
        deps,
      );
      expect(files?.map((file) => file.title)).toEqual(['Logótipo']);
      expect(files?.[0]?.versions.map((version) => version.number)).toEqual([2, 1]);
      expect(files?.[0]?.versions[0]?.approval?.status).toBe('pending');
      expect(files?.[0]?.versions[0]?.openComments).toBe(2);

      const version = await loadProofVersion(manager, proof.versionTwoId, deps);
      expect(version?.comments.map((comment) => comment.internal)).toEqual([false, true]);
      expect(version?.rounds).toEqual({ used: 0, limit: 3, warning: false, extra: false });
      expect(
        await loadProofVersion(proofClaims(world.users.freelancer), proof.versionTwoId, deps),
      ).toBeNull();
    });
  });

  it('client view hides internal comments', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const { deps } = proofingDeps(sql);

      const view = await deps.contexts.withUserContext(
        proofClaims(world.users.operationalA, 'client'),
        (tx) => getClientProofVersion(tx, proof.versionTwoId),
      );
      expect(view?.comments.map((comment) => comment.id)).toEqual([proof.clientCommentId]);
      expect(view?.approval).toMatchObject({ id: proof.approvalId, status: 'pending' });
      expect(view?.rounds.limit).toBe(3);
      const old = await deps.contexts.withUserContext(
        proofClaims(world.users.operationalA, 'client'),
        (tx) => getClientProofVersion(tx, proof.versionOneId),
      );
      expect(old).toBeNull();
    });
  });

  it('approvals central groups phases and files', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const { deps } = proofingDeps(sql);

      const pending = await deps.contexts.withUserContext(
        proofClaims(world.users.decisionMakerA, 'client'),
        (tx) => getClientApprovals(tx, world.clients.a),
      );
      expect(
        pending.map((approval) => [approval.kind, approval.subjectName, approval.versionId]).sort(),
      ).toEqual(
        [
          ['file', 'Logótipo', proof.versionTwoId],
          ['phase', 'Fase 1', null],
        ].sort(),
      );
    });
  });

  it('approval alerts name the file and link to it', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const { deps } = proofingDeps(sql);

      expect(
        await approvalNotice(proof.approvalId, {
          contexts: deps.contexts,
          appBaseUrl: 'https://os.example.com',
        }),
      ).toEqual({
        companyName: expect.any(String),
        phaseName: 'Logótipo',
        subject: 'file',
        decision: 'changes_requested',
        roomUrl: `https://os.example.com/c/${world.clients.a}/proofs/${proof.versionTwoId}`,
      });
    });
  });

  it('comment notices go the right way', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const { deps } = proofingDeps(sql);
      const noticeDeps = { contexts: deps.contexts, appBaseUrl: 'https://os.example.com' };
      const [team] = await sql<{ id: string }[]>`
        insert into public.proof_comments (organization_id, client_id, project_id, version_id,
                                           author_id, body, number)
        values (${world.organizationId}, ${world.clients.a}, ${proof.rooms.a.projectId},
                ${proof.versionTwoId}, ${world.users.manager}, 'Corrigido', 3)
        returning id
      `;

      expect(await proofCommentNotice(proof.clientCommentId, noticeDeps)).toMatchObject({
        audience: 'team',
        params: { fileTitle: 'Logótipo' },
      });
      expect(await proofCommentNotice(proof.internalCommentId, noticeDeps)).toBeNull();
      expect(await proofCommentNotice(team?.id ?? '', noticeDeps)).toMatchObject({
        audience: 'client',
      });
    });
  });

  it('clients hear only about versions they can open and threads they can read', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const { deps } = proofingDeps(sql);
      const noticeDeps = { contexts: deps.contexts, appBaseUrl: 'https://os.example.com' };
      const [onUnrequested] = await sql<{ id: string }[]>`
        insert into public.proof_comments (organization_id, client_id, project_id, version_id,
                                           author_id, body, number)
        values (${world.organizationId}, ${world.clients.a}, ${proof.rooms.a.projectId},
                ${proof.versionOneId}, ${world.users.manager}, 'Primeira ideia', 1)
        returning id
      `;
      const [insideInternal] = await sql<{ id: string }[]>`
        insert into public.proof_comments (organization_id, client_id, project_id, version_id,
                                           parent_id, author_id, body)
        values (${world.organizationId}, ${world.clients.a}, ${proof.rooms.a.projectId},
                ${proof.versionTwoId}, ${proof.internalCommentId}, ${world.users.manager},
                'Concordo')
        returning id
      `;

      expect(await proofCommentNotice(onUnrequested?.id ?? '', noticeDeps)).toBeNull();
      expect(await proofCommentNotice(insideInternal?.id ?? '', noticeDeps)).toBeNull();
      const visible = await deps.contexts.withUserContext(
        proofClaims(world.users.decisionMakerA, 'client'),
        (tx) =>
          tx.execute<{ id: string }>(
            drizzleSql`select id from public.portal_proof_comments
                       where version_id = ${proof.versionTwoId}::uuid`,
          ),
      );
      expect(visible.map((row) => row.id)).toEqual([proof.clientCommentId]);
    });
  });

  it('the portal lists every proof sent to the client, decided or not', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const { deps } = proofingDeps(sql);
      await sql`
        update public.approvals set status = 'changes_requested', decided_at = now(),
                                    comment = 'Mais contraste'
        where id = ${proof.approvalId}
      `;

      const proofs = await deps.contexts.withUserContext(
        proofClaims(world.users.operationalA, 'client'),
        (tx) => getClientProofs(tx),
      );
      expect(proofs).toEqual([
        {
          versionId: proof.versionTwoId,
          title: 'Logótipo',
          number: 2,
          status: 'changes_requested',
        },
      ]);
      const outsider = await deps.contexts.withUserContext(
        proofClaims(world.users.clientFinanceB, 'client'),
        (tx) => getClientProofs(tx),
      );
      expect(outsider).toEqual([]);
    });
  });
});

describe('previous version for comparison', () => {
  it('the team view names the previous image version', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const { deps } = proofingDeps(sql);
      const manager = proofClaims(world.users.manager);

      const second = await loadProofVersion(manager, proof.versionTwoId, deps);
      const first = await loadProofVersion(manager, proof.versionOneId, deps);

      expect(second?.previousVersion).toEqual({ id: proof.versionOneId, number: 1 });
      expect(first?.previousVersion).toBeNull();
    });
  });

  it('the client view names the previous version only when the client can read it', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const { deps } = proofingDeps(sql);
      const read = () =>
        deps.contexts.withUserContext(proofClaims(world.users.operationalA, 'client'), (tx) =>
          getClientProofVersion(tx, proof.versionTwoId),
        );

      expect((await read())?.previousVersion).toBeNull();

      await sql`reset role`;
      await sql`
        insert into public.approvals (organization_id, client_id, project_id, subject_type,
                                      subject_id, requested_by)
        values (${world.organizationId}, ${world.clients.a}, ${proof.rooms.a.projectId},
                'file_version', ${proof.versionOneId}, ${world.users.founder})
      `;

      expect((await read())?.previousVersion).toEqual({ id: proof.versionOneId, number: 1 });
    });
  });
});
