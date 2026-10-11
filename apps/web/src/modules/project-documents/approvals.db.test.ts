import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createDocumentFixture,
  createFixtureWorld,
  withTestTransaction,
} from '@agency-os/db/testing';
import { approvalNotice, getClientApprovals } from '@/modules/rooms/server';
import { decideDocumentApproval, requestDocumentApproval } from './approvals';
import { documentClaims, documentsDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

async function documentStatus(sql: TransactionSql, documentId: string) {
  await sql`reset role`;
  const [row] = await sql<{ status: string; approved: boolean }[]>`
    select status::text, approved_at is not null as approved from public.project_documents
    where id = ${documentId}
  `;
  return row;
}

describe('document approvals', () => {
  it('the team asks the decision maker to approve the current version', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps } = documentsDeps(sql);
      const manager = documentClaims(world.users.manager);

      expect(
        await requestDocumentApproval(manager, { documentId: documents.a.draftId }, deps),
      ).toEqual({ ok: false, rule: 'invalid_state' });
      const requested = await requestDocumentApproval(
        manager,
        { documentId: documents.a.sharedId },
        deps,
      );
      if (!requested.ok) throw new Error('Approval was not requested');
      expect(
        await requestDocumentApproval(manager, { documentId: documents.a.sharedId }, deps),
      ).toEqual({ ok: false, rule: 'invalid_state' });
      await sql`reset role`;
      const [approval] = await sql<{ subject_type: string; subject_id: string }[]>`
        select subject_type::text, subject_id from public.approvals where id = ${requested.approvalId}
      `;
      expect(approval).toEqual({
        subject_type: 'document_version',
        subject_id: documents.a.sharedV1Id,
      });
      const events = await sql<{ total: number }[]>`
        select count(*)::int as total from public.domain_events
        where organization_id = ${world.organizationId} and type = 'rooms.approval.requested'
      `;
      expect(events[0]?.total).toBe(1);
    });
  });

  it('approving marks the document approved once', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps } = documentsDeps(sql);
      const requested = await requestDocumentApproval(
        documentClaims(world.users.manager),
        { documentId: documents.a.sharedId },
        deps,
      );
      if (!requested.ok) throw new Error('Approval was not requested');
      const decide = (decision: 'approved' | 'changes_requested') =>
        decideDocumentApproval(
          documentClaims(world.users.decisionMakerA, 'client'),
          { approvalId: requested.approvalId, decision, comment: 'Pode seguir' },
          deps,
        );

      expect(await decide('approved')).toEqual({ ok: true, status: 'approved' });
      expect(await decide('changes_requested')).toEqual({ ok: true, status: 'approved' });
      expect(await documentStatus(sql, documents.a.sharedId)).toEqual({
        status: 'approved',
        approved: true,
      });
      const tasks = await sql<{ total: number }[]>`
        select count(*)::int as total from public.tasks where project_id = ${documents.a.projectId}
      `;
      expect(tasks[0]?.total).toBe(0);
    });
  });

  it('changes need a comment and create the review task', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps } = documentsDeps(sql);
      const requested = await requestDocumentApproval(
        documentClaims(world.users.manager),
        { documentId: documents.a.sharedId },
        deps,
      );
      if (!requested.ok) throw new Error('Approval was not requested');
      const decisionMaker = documentClaims(world.users.decisionMakerA, 'client');

      expect(
        await decideDocumentApproval(
          decisionMaker,
          { approvalId: requested.approvalId, decision: 'changes_requested', comment: ' ' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'comment_required' });
      expect(
        await decideDocumentApproval(
          decisionMaker,
          {
            approvalId: requested.approvalId,
            decision: 'changes_requested',
            comment: 'Falta o orçamento',
          },
          deps,
        ),
      ).toEqual({ ok: true, status: 'changes_requested' });
      expect(await documentStatus(sql, documents.a.sharedId)).toEqual({
        status: 'with_client',
        approved: false,
      });
      const tasks = await sql<{ title: string; notes: string; assignee_id: string }[]>`
        select title, notes, assignee_id from public.tasks where project_id = ${documents.a.projectId}
      `;
      expect(tasks).toEqual([
        {
          title: 'Rever documento',
          notes: 'Estratégia: Falta o orçamento',
          assignee_id: world.users.manager,
        },
      ]);
    });
  });

  it('operational users cannot decide', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps } = documentsDeps(sql);
      const requested = await requestDocumentApproval(
        documentClaims(world.users.founder),
        { documentId: documents.a.sharedId },
        deps,
      );
      if (!requested.ok) throw new Error('Approval was not requested');

      expect(
        await decideDocumentApproval(
          documentClaims(world.users.operationalA, 'client'),
          { approvalId: requested.approvalId, decision: 'approved', comment: '' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });

  it('document approvals appear under documents in the portal', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps } = documentsDeps(sql);
      const requested = await requestDocumentApproval(
        documentClaims(world.users.manager),
        { documentId: documents.a.sharedId },
        deps,
      );
      if (!requested.ok) throw new Error('Approval was not requested');

      const pending = await deps.contexts.withUserContext(
        documentClaims(world.users.decisionMakerA, 'client'),
        (tx) => getClientApprovals(tx, world.clients.a),
      );
      expect(pending.filter((approval) => approval.kind === 'document')).toEqual([
        expect.objectContaining({
          id: requested.approvalId,
          kind: 'document',
          subjectName: 'Estratégia',
          documentId: documents.a.sharedId,
        }),
      ]);
    });
  });

  it('approval notices name the document', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps } = documentsDeps(sql);
      const requested = await requestDocumentApproval(
        documentClaims(world.users.manager),
        { documentId: documents.a.sharedId },
        deps,
      );
      if (!requested.ok) throw new Error('Approval was not requested');

      expect(
        await approvalNotice(requested.approvalId, {
          contexts: deps.contexts,
          appBaseUrl: 'https://os.example.com',
        }),
      ).toMatchObject({
        phaseName: 'Estratégia',
        subject: 'document',
        roomUrl: `https://os.example.com/c/${world.clients.a}/docs/${documents.a.sharedId}`,
      });
    });
  });
});
