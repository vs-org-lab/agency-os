import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createDocumentFixture,
  createFixtureWorld,
  withTestTransaction,
} from '@agency-os/db/testing';
import { removeProjectDocument, shareProjectDocument, withdrawProjectDocument } from './lifecycle';
import { documentClaims, documentsDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

async function status(sql: TransactionSql, documentId: string): Promise<string | undefined> {
  await sql`reset role`;
  const [row] = await sql<{ status: string }[]>`
    select status::text from public.project_documents where id = ${documentId}
  `;
  return row?.status;
}

async function pendingApproval(
  sql: TransactionSql,
  world: { organizationId: string; clients: { a: string }; users: { founder: string } },
  projectId: string,
  versionId: string,
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into public.approvals (organization_id, client_id, project_id, subject_type, subject_id,
                                  requested_by)
    values (${world.organizationId}, ${world.clients.a}, ${projectId}, 'document_version',
            ${versionId}, ${world.users.founder})
    returning id
  `;
  if (!row) throw new Error('Approval was not created');
  return row.id;
}

describe('document lifecycle', () => {
  it('sharing shows the current version to the client once', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps, flushes } = documentsDeps(sql);
      const manager = documentClaims(world.users.manager);

      expect(
        await shareProjectDocument(
          documentClaims(world.users.decisionMakerA, 'client'),
          { documentId: documents.a.draftId },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
      expect(
        await shareProjectDocument(manager, { documentId: documents.a.draftId }, deps),
      ).toEqual({ ok: true });
      expect(
        await shareProjectDocument(manager, { documentId: documents.a.draftId }, deps),
      ).toEqual({ ok: false, rule: 'invalid_state' });
      expect(await status(sql, documents.a.draftId)).toBe('with_client');
      const [version] = await sql<{ shared: boolean }[]>`
        select shared_at is not null as shared from public.project_document_versions
        where id = ${documents.a.draftVersionId}
      `;
      expect(version?.shared).toBe(true);
      const events = await sql<{ total: number }[]>`
        select count(*)::int as total from public.domain_events
        where organization_id = ${world.organizationId} and type = 'rooms.document.shared'
      `;
      expect(events[0]?.total).toBe(1);
      expect(flushes).toHaveLength(1);
    });
  });

  it('withdrawing is refused after approval', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps } = documentsDeps(sql);
      const manager = documentClaims(world.users.manager);
      const approvalId = await pendingApproval(
        sql,
        world,
        documents.a.projectId,
        documents.a.sharedV1Id,
      );

      expect(
        await withdrawProjectDocument(manager, { documentId: documents.a.approvedId }, deps),
      ).toEqual({ ok: false, rule: 'invalid_state' });
      expect(
        await withdrawProjectDocument(manager, { documentId: documents.a.sharedId }, deps),
      ).toEqual({ ok: true });
      expect(await status(sql, documents.a.sharedId)).toBe('draft');
      const [approval] = await sql<{ status: string }[]>`
        select status::text from public.approvals where id = ${approvalId}
      `;
      expect(approval?.status).toBe('withdrawn');
    });
  });

  it('removing is refused once approved and deletes stored files otherwise', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps, storage } = documentsDeps(sql);
      const founder = documentClaims(world.users.founder);

      expect(
        await removeProjectDocument(founder, { documentId: documents.a.approvedId }, deps),
      ).toEqual({ ok: false, rule: 'invalid_state' });
      expect(
        await removeProjectDocument(founder, { documentId: documents.a.sharedId }, deps),
      ).toEqual({ ok: true });
      expect(await status(sql, documents.a.sharedId)).toBeUndefined();
      expect([...storage.removed].sort()).toEqual([
        `documents/fixture/${documents.a.sharedId}/1`,
        `documents/fixture/${documents.a.sharedId}/2`,
      ]);
    });
  });
});
