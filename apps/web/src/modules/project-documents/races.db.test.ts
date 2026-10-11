import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createDocumentFixture,
  createFixtureWorld,
  withTestTransaction,
} from '@agency-os/db/testing';
import type { DocumentsDeps } from './access';
import { addDocumentComment } from './comments';
import { removeProjectDocument, shareProjectDocument, withdrawProjectDocument } from './lifecycle';
import { loadPortalDocument } from './readers';
import { documentClaims, documentsDeps, PNG_BYTES } from './testing';
import { addDocumentVersion, confirmDocumentVersion } from './versions';

afterAll(async () => {
  await closeTestSql();
});

/**
 * Runs `change` right before the system-context call number `call`, standing in for another request
 * that commits between a service's checks and its write.
 */
function interleave(
  deps: DocumentsDeps,
  call: number,
  change: () => Promise<unknown>,
): DocumentsDeps {
  let calls = 0;
  const base = deps.contexts.withSystemContext;
  return {
    ...deps,
    contexts: {
      ...deps.contexts,
      withSystemContext: (async (work: Parameters<typeof base>[0]) => {
        calls += 1;
        if (calls === call) await change();
        return base(work);
      }) as typeof base,
    },
  };
}

async function documentRow(sql: TransactionSql, documentId: string) {
  await sql`reset role`;
  const [row] = await sql<{ status: string; current: string | null }[]>`
    select status::text, current_version_id as current from public.project_documents
    where id = ${documentId}
  `;
  return row;
}

describe('document races', () => {
  it('removing refuses a document approved after it was loaded', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps } = documentsDeps(sql);
      const racing = interleave(
        deps,
        3,
        async () =>
          (await sql`reset role`) &&
          sql`update public.project_documents set status = 'approved', approved_at = now()
            where id = ${documents.a.sharedId}`,
      );

      expect(
        await removeProjectDocument(
          documentClaims(world.users.founder),
          { documentId: documents.a.sharedId },
          racing,
        ),
      ).toEqual({ ok: false, rule: 'invalid_state' });
      expect((await documentRow(sql, documents.a.sharedId))?.status).toBe('approved');
    });
  });

  it('a new link version reads the document state under its lock', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps } = documentsDeps(sql);
      await sql`
        update public.project_documents set status = 'with_client', shared_at = now()
        where id = ${documents.a.draftId}
      `;
      const racing = interleave(
        deps,
        3,
        async () =>
          (await sql`reset role`) &&
          sql`update public.project_documents set status = 'approved', approved_at = now(),
                   approved_version_id = ${documents.a.draftVersionId}
            where id = ${documents.a.draftId}`,
      );

      const added = await addDocumentVersion(
        documentClaims(world.users.manager),
        { documentId: documents.a.draftId, url: 'https://example.com/briefing-2' },
        racing,
      );
      if (!added.ok) throw new Error('Version was not added');
      expect((await documentRow(sql, documents.a.draftId))?.status).toBe('draft');
      const [version] = await sql<{ shared: boolean }[]>`
        select shared_at is not null as shared from public.project_document_versions
        where id = ${added.versionId}
      `;
      expect(version?.shared).toBe(false);
    });
  });

  it('a late upload never replaces a newer current version', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps, storage } = documentsDeps(sql);
      const manager = documentClaims(world.users.manager);
      await sql`update public.project_documents set kind = 'file' where id = ${documents.a.draftId}`;

      const slow = await addDocumentVersion(
        manager,
        {
          documentId: documents.a.draftId,
          file: { name: 'capa.png', sizeBytes: PNG_BYTES.length },
        },
        deps,
      );
      const fast = await addDocumentVersion(
        manager,
        {
          documentId: documents.a.draftId,
          file: { name: 'capa-2.png', sizeBytes: PNG_BYTES.length },
        },
        deps,
      );
      if (!slow.ok || !slow.uploadUrl || !fast.ok || !fast.uploadUrl) {
        throw new Error('Versions were not added');
      }
      storage.files.set(slow.uploadUrl.slice('memory://upload/'.length), PNG_BYTES);
      storage.files.set(fast.uploadUrl.slice('memory://upload/'.length), PNG_BYTES);
      expect(await confirmDocumentVersion(manager, { versionId: fast.versionId }, deps)).toEqual({
        ok: true,
      });
      expect(await confirmDocumentVersion(manager, { versionId: slow.versionId }, deps)).toEqual({
        ok: true,
      });
      expect((await documentRow(sql, documents.a.draftId))?.current).toBe(fast.versionId);
    });
  });

  it('a confirmation that loses the race never removes a ready file', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps, storage } = documentsDeps(sql);
      const manager = documentClaims(world.users.manager);
      await sql`update public.project_documents set kind = 'file' where id = ${documents.a.draftId}`;
      const added = await addDocumentVersion(
        manager,
        {
          documentId: documents.a.draftId,
          file: { name: 'capa.png', sizeBytes: PNG_BYTES.length },
        },
        deps,
      );
      if (!added.ok) throw new Error('Version was not added');
      const racing: DocumentsDeps = {
        ...deps,
        storage: {
          ...storage,
          download: async () => {
            await sql`reset role`;
            await sql`
              update public.project_document_versions set upload_status = 'ready'
              where id = ${added.versionId}
            `;
            return null;
          },
        },
      };

      expect(await confirmDocumentVersion(manager, { versionId: added.versionId }, racing)).toEqual(
        {
          ok: false,
          rule: 'not_found',
        },
      );
      expect(storage.removed).toEqual([]);
      const [version] = await sql<{ upload_status: string }[]>`
        select upload_status::text from public.project_document_versions
        where id = ${added.versionId}
      `;
      expect(version?.upload_status).toBe('ready');
    });
  });

  it('a reopened document shows the client the approved version until the next is shared', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps } = documentsDeps(sql);
      const manager = documentClaims(world.users.manager);
      const decisionMaker = documentClaims(world.users.decisionMakerA, 'client');
      const portal = () => loadPortalDocument(decisionMaker, documents.a.approvedId, deps);

      const added = await addDocumentVersion(
        manager,
        {
          documentId: documents.a.approvedId,
          url: 'https://www.figma.com/design/AbC123/Estrategia-v2',
        },
        deps,
      );
      if (!added.ok) throw new Error('Version was not added');
      expect(await portal()).toMatchObject({
        status: 'approved',
        version: { id: documents.a.approvedVersionId },
      });

      expect(
        await shareProjectDocument(manager, { documentId: documents.a.approvedId }, deps),
      ).toEqual({ ok: true });
      expect(await portal()).toMatchObject({
        status: 'with_client',
        version: { id: added.versionId },
      });

      expect(
        await withdrawProjectDocument(manager, { documentId: documents.a.approvedId }, deps),
      ).toEqual({ ok: true });
      const reopened = await portal();
      expect(reopened).toMatchObject({
        status: 'approved',
        version: { id: documents.a.approvedVersionId },
      });
      expect(reopened?.versions.map((version) => version.id)).toEqual([
        documents.a.approvedVersionId,
      ]);
      const comment = await addDocumentComment(
        decisionMaker,
        { documentId: documents.a.approvedId, body: 'Ficamos com esta' },
        deps,
      );
      if (!comment.ok) throw new Error('Comment was not added');
      await sql`reset role`;
      const [row] = await sql<{ version_id: string }[]>`
        select version_id from public.project_document_comments where id = ${comment.commentId}
      `;
      expect(row?.version_id).toBe(documents.a.approvedVersionId);
    });
  });
});
