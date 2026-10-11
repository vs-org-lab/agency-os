import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asUser,
  closeTestSql,
  createDocumentFixture,
  createFixtureWorld,
  withTestTransaction,
} from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

async function visibleIds(sql: TransactionSql, relation: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`select id from ${sql('public.' + relation)}`.catch(
    (error: Error) => {
      if (/permission denied/.test(error.message)) return [];
      throw error;
    },
  );
  return rows.map((row) => row.id).sort();
}

const sorted = (...ids: string[]) => [...ids].sort();

describe('project documents access', () => {
  it('team reads documents of readable projects only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const clientA = sorted(documents.a.draftId, documents.a.sharedId, documents.a.approvedId);
      await sql`
        insert into public.project_staff_assignments (organization_id, client_id, project_id, user_id)
        values (${world.organizationId}, ${world.clients.a}, ${documents.a.projectId},
                ${world.users.freelancer})
      `;

      await asUser(sql, world.users.founder);
      expect(await visibleIds(sql, 'project_documents')).toEqual(
        sorted(...clientA, documents.b.documentId),
      );
      await asUser(sql, world.users.freelancer);
      expect(await visibleIds(sql, 'project_documents')).toEqual(clientA);
      expect(await visibleIds(sql, 'project_document_comments')).toEqual(
        sorted(documents.a.publicCommentId, documents.a.internalCommentId),
      );
      await asUser(sql, world.users.finance);
      expect(await visibleIds(sql, 'project_document_versions')).toHaveLength(5);
    });
  });

  it('clients read shared documents, shown versions and public comments only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);

      for (const userId of [world.users.decisionMakerA, world.users.operationalA]) {
        await asUser(sql, userId, { aal: 'aal1' });
        expect(await visibleIds(sql, 'portal_project_documents')).toEqual(
          sorted(documents.a.sharedId, documents.a.approvedId),
        );
        expect(await visibleIds(sql, 'portal_project_document_versions')).toEqual(
          sorted(documents.a.sharedV1Id, documents.a.approvedVersionId),
        );
        expect(await visibleIds(sql, 'portal_project_document_comments')).toEqual([
          documents.a.publicCommentId,
        ]);
        expect(await visibleIds(sql, 'project_documents')).toEqual([]);
      }
      await asUser(sql, world.users.clientFinanceB, { aal: 'aal1' });
      expect(await visibleIds(sql, 'portal_project_documents')).toEqual([]);
    });
  });

  it('nobody writes documents directly', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createDocumentFixture(sql, world);

      for (const [userId, aal] of [
        [world.users.founder, 'aal2'],
        [world.users.decisionMakerA, 'aal1'],
      ] as const) {
        await asUser(sql, userId, { aal });
        for (const statement of [
          sql`update public.project_documents set title = 'Alterado'`,
          sql`delete from public.project_document_versions`,
          sql`delete from public.project_document_comments`,
        ]) {
          await sql`savepoint probe`;
          expect(await statement.catch((error: Error) => error)).toBeInstanceOf(Error);
          await sql`rollback to savepoint probe`;
        }
      }
    });
  });
});
