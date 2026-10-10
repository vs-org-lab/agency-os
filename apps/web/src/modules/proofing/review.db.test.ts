import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createProofFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { decideFileApproval, requestVersionApproval, setRevisionLimit } from './approvals';
import { addProofComment, resolveProofComment } from './comments';
import { addProofVersion, confirmProofVersion } from './files';
import { PNG_BYTES, proofClaims, proofingDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

describe('proof review', () => {
  it('client comments on a point and the team replies', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const { deps } = proofingDeps(sql);

      const client = await addProofComment(
        proofClaims(world.users.operationalA, 'client'),
        {
          versionId: proof.versionTwoId,
          body: 'O azul está escuro',
          anchor: { type: 'point', x: 20, y: 30 },
        },
        deps,
      );
      if (!client.ok) throw new Error('Comment was not added');
      const reply = await addProofComment(
        proofClaims(world.users.manager),
        { versionId: proof.versionTwoId, body: 'Vamos clarear', parentId: client.commentId },
        deps,
      );
      expect(reply.ok).toBe(true);
      expect(
        await resolveProofComment(
          proofClaims(world.users.manager),
          { commentId: client.commentId, resolved: true },
          deps,
        ),
      ).toEqual({ ok: true });

      const rows = await sql<{ id: string; number: number | null; resolved: boolean }[]>`
        select id, number, resolved_at is not null as resolved from public.proof_comments
        where version_id = ${proof.versionTwoId} order by created_at, id
      `;
      const added = rows.find((row) => row.id === client.commentId);
      expect(added).toMatchObject({ number: 3, resolved: true });
      expect(rows.find((row) => row.id === (reply.ok ? reply.commentId : ''))?.number).toBeNull();
      const events = await sql`
        select 1 from public.domain_events
        where organization_id = ${world.organizationId} and type = 'proofing.comment.added'
      `;
      expect(events).toHaveLength(2);
    });
  });

  it('clients never post internal comments', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const { deps } = proofingDeps(sql);

      expect(
        await addProofComment(
          proofClaims(world.users.decisionMakerA, 'client'),
          { versionId: proof.versionTwoId, body: 'Só para a equipa', internal: true },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_input' });
      expect(
        await addProofComment(
          proofClaims(world.users.decisionMakerA, 'client'),
          { versionId: proof.versionOneId, body: 'Versão antiga' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });

  it('anchors outside the page are refused', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const { deps } = proofingDeps(sql);

      expect(
        await addProofComment(
          proofClaims(world.users.manager),
          {
            versionId: proof.versionTwoId,
            body: 'Fora',
            anchor: { type: 'point', x: 120, y: 30 },
          },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_input' });
    });
  });

  it('a new version withdraws the pending request', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const { deps, storage } = proofingDeps(sql);
      const manager = proofClaims(world.users.manager);

      const next = await addProofVersion(manager, { fileId: proof.fileId }, deps);
      if (!next.ok) throw new Error('Version was not added');
      storage.files.set(next.uploadUrl.replace('memory://upload/', ''), PNG_BYTES);
      await confirmProofVersion(manager, { versionId: next.versionId }, deps);

      const [old] = await sql<{ status: string }[]>`
        select status::text from public.approvals where id = ${proof.approvalId}
      `;
      expect(old?.status).toBe('withdrawn');
      expect(
        await requestVersionApproval(manager, { versionId: proof.versionTwoId }, deps),
      ).toEqual({ ok: false, rule: 'invalid_state' });
      const requested = await requestVersionApproval(manager, { versionId: next.versionId }, deps);
      expect(requested.ok).toBe(true);
    });
  });

  it('change request counts a round and the fourth is extra', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const { deps } = proofingDeps(sql);
      const decider = proofClaims(world.users.decisionMakerA, 'client');

      expect(
        await decideFileApproval(
          decider,
          { approvalId: proof.approvalId, decision: 'changes_requested', comment: '' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'comment_required' });
      await sql`reset role`;
      for (let round = 0; round < 3; round += 1) {
        await sql`
          insert into public.approvals (organization_id, client_id, project_id, subject_type,
                                        subject_id, status, decided_at, comment)
          values (${world.organizationId}, ${world.clients.a}, ${proof.rooms.a.projectId},
                  'file_version', ${proof.versionOneId}, 'changes_requested', now(), 'Ronda')
        `;
      }

      expect(
        await decideFileApproval(
          decider,
          { approvalId: proof.approvalId, decision: 'changes_requested', comment: 'Outra vez' },
          deps,
        ),
      ).toEqual({
        ok: true,
        status: 'changes_requested',
        rounds: { used: 4, limit: 3, warning: true, extra: true },
      });
      const [approval] = await sql<{ extra_round: boolean }[]>`
        select extra_round from public.approvals where id = ${proof.approvalId}
      `;
      expect(approval?.extra_round).toBe(true);
      const tasks = await sql<{ title: string; assignee_id: string }[]>`
        select title, assignee_id from public.tasks where project_id = ${proof.rooms.a.projectId}
      `;
      expect(tasks).toEqual([
        { title: 'Orçamentar ronda extra', assignee_id: world.users.manager },
      ]);
      const events = await sql`
        select 1 from public.domain_events
        where organization_id = ${world.organizationId} and type = 'proofing.round.extra'
      `;
      expect(events).toHaveLength(1);
      expect(
        await decideFileApproval(
          proofClaims(world.users.operationalA, 'client'),
          { approvalId: proof.approvalId, decision: 'approved', comment: '' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });

  it('the warning is emitted once', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const proof = await createProofFixture(sql, world);
      const { deps } = proofingDeps(sql);
      const decider = proofClaims(world.users.decisionMakerA, 'client');
      const manager = proofClaims(world.users.manager);
      await sql`
        insert into public.approvals (organization_id, client_id, project_id, subject_type,
                                      subject_id, status, decided_at, comment)
        values (${world.organizationId}, ${world.clients.a}, ${proof.rooms.a.projectId},
                'file_version', ${proof.versionOneId}, 'changes_requested', now(), 'Ronda')
      `;

      await decideFileApproval(
        decider,
        { approvalId: proof.approvalId, decision: 'changes_requested', comment: 'Segunda' },
        deps,
      );
      expect(
        await setRevisionLimit(manager, { projectId: proof.rooms.a.projectId, limit: 21 }, deps),
      ).toEqual({ ok: false, rule: 'invalid_input' });
      const warnings = await sql`
        select 1 from public.domain_events
        where organization_id = ${world.organizationId} and type = 'proofing.rounds.warning'
      `;
      expect(warnings).toHaveLength(0);

      await setRevisionLimit(manager, { projectId: proof.rooms.a.projectId, limit: 2 }, deps);
      const approval = await requestVersionApproval(
        manager,
        { versionId: proof.versionTwoId },
        deps,
      );
      if (!approval.ok) throw new Error('Approval was not requested');
      await decideFileApproval(
        decider,
        { approvalId: approval.approvalId, decision: 'changes_requested', comment: 'Terceira' },
        deps,
      );
      const again = await requestVersionApproval(
        manager,
        { versionId: proof.versionTwoId },
        deps,
      );
      if (!again.ok) throw new Error('Approval was not requested');
      await decideFileApproval(
        decider,
        { approvalId: again.approvalId, decision: 'changes_requested', comment: 'Quarta' },
        deps,
      );
      const after = await sql`
        select 1 from public.domain_events
        where organization_id = ${world.organizationId} and type = 'proofing.rounds.warning'
      `;
      expect(after).toHaveLength(1);
    });
  });
});
