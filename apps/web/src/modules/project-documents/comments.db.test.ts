import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createDocumentFixture,
  createFixtureWorld,
  withTestTransaction,
} from '@agency-os/db/testing';
import { addDocumentComment } from './comments';
import { documentCommentNotice } from './notices';
import { DOCUMENTS_TEST_NOW, documentClaims, documentsDeps } from './testing';
import { sweepStaleDocumentUploads } from './versions';

afterAll(async () => {
  await closeTestSql();
});

const APP = 'https://os.example.com';

async function commentEvents(sql: TransactionSql, organizationId: string): Promise<number> {
  await sql`reset role`;
  const [row] = await sql<{ total: number }[]>`
    select count(*)::int as total from public.domain_events
    where organization_id = ${organizationId} and type = 'rooms.document.commented'
  `;
  return row?.total ?? 0;
}

describe('document comments', () => {
  it('clients and the team comment on visible documents', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps } = documentsDeps(sql);
      const decisionMaker = documentClaims(world.users.decisionMakerA, 'client');

      const fromClient = await addDocumentComment(
        decisionMaker,
        { documentId: documents.a.sharedId, body: 'Gostamos da página 2' },
        deps,
      );
      if (!fromClient.ok) throw new Error('Client comment was not added');
      expect(
        await addDocumentComment(
          documentClaims(world.users.operationalA, 'client'),
          { documentId: documents.a.sharedId, body: 'Confirmo' },
          deps,
        ),
      ).toMatchObject({ ok: true });
      expect(
        await addDocumentComment(
          decisionMaker,
          { documentId: documents.a.draftId, body: 'Olá' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
      expect(
        await addDocumentComment(
          decisionMaker,
          { documentId: documents.a.sharedId, body: 'Só para mim', internal: true },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_input' });
      expect(
        await addDocumentComment(
          documentClaims(world.users.manager),
          { documentId: documents.a.sharedId, body: ' ' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_input' });
      await sql`reset role`;
      const [row] = await sql<{ version_id: string }[]>`
        select version_id from public.project_document_comments where id = ${fromClient.commentId}
      `;
      expect(row?.version_id).toBe(documents.a.sharedV1Id);
      expect(await commentEvents(sql, world.organizationId)).toBe(2);
    });
  });

  it('internal comments never leave and never notify', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps } = documentsDeps(sql);

      const internal = await addDocumentComment(
        documentClaims(world.users.manager),
        { documentId: documents.a.sharedId, body: 'Ver com o designer', internal: true },
        deps,
      );
      if (!internal.ok) throw new Error('Internal comment was not added');
      expect(await commentEvents(sql, world.organizationId)).toBe(0);
      expect(
        await documentCommentNotice(internal.commentId, {
          contexts: deps.contexts,
          appBaseUrl: APP,
        }),
      ).toBeNull();
    });
  });

  it('comment notices go to the other side', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps } = documentsDeps(sql);
      const notice = (commentId: string) =>
        documentCommentNotice(commentId, { contexts: deps.contexts, appBaseUrl: APP });

      expect(await notice(documents.a.publicCommentId)).toEqual({
        audience: 'team',
        organizationId: world.organizationId,
        clientId: world.clients.a,
        documentId: documents.a.sharedId,
        params: {
          companyName: expect.any(String),
          documentTitle: 'Estratégia',
          roomUrl: `${APP}/c/${world.clients.a}/docs/${documents.a.sharedId}`,
        },
      });
      const fromTeam = await addDocumentComment(
        documentClaims(world.users.manager),
        { documentId: documents.a.sharedId, body: 'Já corrigimos' },
        deps,
      );
      if (!fromTeam.ok) throw new Error('Team comment was not added');
      expect(await notice(fromTeam.commentId)).toMatchObject({
        audience: 'client',
        documentId: documents.a.sharedId,
      });
      const onDraft = await addDocumentComment(
        documentClaims(world.users.manager),
        { documentId: documents.a.draftId, body: 'Rascunho' },
        deps,
      );
      if (!onDraft.ok) throw new Error('Draft comment was not added');
      expect(await notice(onDraft.commentId)).toBeNull();
    });
  });

  it('stale document uploads are removed with their stored objects', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps, storage } = documentsDeps(sql);
      await sql`
        update public.project_document_versions
        set upload_status = 'uploading', created_at = ${DOCUMENTS_TEST_NOW.toISOString()}::timestamptz - interval '4 hours'
        where id = ${documents.a.sharedV2Id}
      `;

      expect(await sweepStaleDocumentUploads(deps)).toEqual({ removed: 1 });
      expect(storage.removed).toEqual([`documents/fixture/${documents.a.sharedId}/2`]);
      const [row] = await sql<{ upload_status: string }[]>`
        select upload_status::text from public.project_document_versions
        where id = ${documents.a.sharedV2Id}
      `;
      expect(row?.upload_status).toBe('rejected');
    });
  });
});
