import { sql as drizzleSql } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createDocumentFixture,
  createFixtureWorld,
  withTestTransaction,
} from '@agency-os/db/testing';
import { documentClaims, documentsDeps, PNG_BYTES } from './testing';
import { addDocumentVersion, confirmDocumentVersion, createProjectDocument } from './versions';

afterAll(async () => {
  await closeTestSql();
});

const UPLOAD_PREFIX = 'memory://upload/';

async function pdfBytes(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage([300, 400]);
  return document.save();
}

async function documentRow(sql: TransactionSql, documentId: string) {
  await sql`reset role`;
  const [row] = await sql<
    { status: string; number: number | null; approved: boolean; kind: string }[]
  >`
    select d.status::text, v.number, d.approved_at is not null as approved, d.kind::text
    from public.project_documents d
    left join public.project_document_versions v on v.id = d.current_version_id
    where d.id = ${documentId}
  `;
  return row;
}

describe('document versions', () => {
  it('links create a ready first version', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps } = documentsDeps(sql);
      const manager = documentClaims(world.users.manager);
      const projectId = documents.a.projectId;

      const created = await createProjectDocument(
        manager,
        {
          projectId,
          title: ' Estratégia de marca ',
          kind: 'figma',
          url: 'https://www.figma.com/design/XyZ789/Marca',
        },
        deps,
      );
      if (!created.ok) throw new Error('Document was not created');
      expect(created.uploadUrl).toBeNull();
      expect(await documentRow(sql, created.documentId)).toEqual({
        status: 'draft',
        number: 1,
        approved: false,
        kind: 'figma',
      });
      for (const input of [
        { projectId, title: 'Link', kind: 'link' as const, url: 'http://example.com' },
        { projectId, title: ' ', kind: 'link' as const, url: 'https://example.com' },
        { projectId, title: 'Figma', kind: 'figma' as const, url: 'https://example.com/design/x' },
      ]) {
        expect(await createProjectDocument(manager, input, deps)).toEqual({
          ok: false,
          rule: 'invalid_input',
        });
      }
    });
  });

  it('files wait for their upload and are verified', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps, storage } = documentsDeps(sql);
      const manager = documentClaims(world.users.manager);
      const bytes = await pdfBytes();

      const created = await createProjectDocument(
        manager,
        {
          projectId: documents.a.projectId,
          title: 'Guia',
          kind: 'pdf',
          file: { name: 'guia.pdf', sizeBytes: bytes.length },
        },
        deps,
      );
      if (!created.ok || !created.uploadUrl) throw new Error('Document was not created');
      expect(await documentRow(sql, created.documentId)).toMatchObject({ number: null });
      storage.files.set(created.uploadUrl.slice(UPLOAD_PREFIX.length), bytes);
      expect(await confirmDocumentVersion(manager, { versionId: created.versionId }, deps)).toEqual(
        { ok: true },
      );
      expect(await documentRow(sql, created.documentId)).toMatchObject({
        status: 'draft',
        number: 1,
      });
      const [version] = await sql<{ pages: number; size_bytes: string; mime_type: string }[]>`
        select pages, size_bytes::text, mime_type from public.project_document_versions
        where id = ${created.versionId}
      `;
      expect(version).toEqual({
        pages: 1,
        size_bytes: String(bytes.length),
        mime_type: 'application/pdf',
      });

      const disguised = await createProjectDocument(
        manager,
        {
          projectId: documents.a.projectId,
          title: 'Falso',
          kind: 'pdf',
          file: { name: 'falso.pdf', sizeBytes: PNG_BYTES.length },
        },
        deps,
      );
      if (!disguised.ok || !disguised.uploadUrl) throw new Error('Document was not created');
      const path = disguised.uploadUrl.slice(UPLOAD_PREFIX.length);
      storage.files.set(path, PNG_BYTES);
      expect(
        await confirmDocumentVersion(manager, { versionId: disguised.versionId }, deps),
      ).toEqual({ ok: false, rule: 'invalid_file' });
      expect(storage.removed).toEqual([path]);
    });
  });

  it('a new version keeps the document state rules', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps, storage } = documentsDeps(sql);
      const manager = documentClaims(world.users.manager);
      const [approval] = await sql<{ id: string }[]>`
        insert into public.approvals (organization_id, client_id, project_id, subject_type,
                                      subject_id, requested_by)
        values (${world.organizationId}, ${world.clients.a}, ${documents.a.projectId},
                'document_version', ${documents.a.sharedV1Id}, ${world.users.founder})
        returning id
      `;

      expect(
        await addDocumentVersion(
          manager,
          { documentId: documents.a.draftId, url: 'https://example.com/briefing-2' },
          deps,
        ),
      ).toMatchObject({ ok: true, uploadUrl: null });
      expect(await documentRow(sql, documents.a.draftId)).toMatchObject({
        status: 'draft',
        number: 2,
      });

      const bytes = await pdfBytes();
      const added = await addDocumentVersion(
        manager,
        { documentId: documents.a.sharedId, file: { name: 'v3.pdf', sizeBytes: bytes.length } },
        deps,
      );
      if (!added.ok || !added.uploadUrl) throw new Error('Version was not added');
      storage.files.set(added.uploadUrl.slice(UPLOAD_PREFIX.length), bytes);
      expect(await confirmDocumentVersion(manager, { versionId: added.versionId }, deps)).toEqual({
        ok: true,
      });
      expect(await documentRow(sql, documents.a.sharedId)).toMatchObject({
        status: 'with_client',
        number: 3,
      });
      const [withdrawn] = await sql<{ status: string }[]>`
        select status::text from public.approvals where id = ${approval?.id ?? ''}
      `;
      expect(withdrawn?.status).toBe('withdrawn');

      expect(
        await addDocumentVersion(
          manager,
          {
            documentId: documents.a.approvedId,
            url: 'https://www.figma.com/design/AbC123/Estrategia-v2',
          },
          deps,
        ),
      ).toMatchObject({ ok: true });
      expect(await documentRow(sql, documents.a.approvedId)).toEqual({
        status: 'draft',
        number: 2,
        approved: true,
        kind: 'figma',
      });
      const shown = await deps.contexts.withUserContext(
        documentClaims(world.users.decisionMakerA, 'client'),
        (tx) =>
          tx.execute<{ id: string }>(drizzleSql`
            select id from public.portal_project_document_versions
            where document_id = ${documents.a.approvedId}::uuid
          `),
      );
      expect(shown.map((row) => row.id)).toEqual([documents.a.approvedVersionId]);
    });
  });

  it('document uploads count against the organisation quota', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps } = documentsDeps(sql);
      await sql`
        update public.project_document_versions set size_bytes = 943718300
        where id = ${documents.a.sharedV1Id}
      `;

      expect(
        await createProjectDocument(
          documentClaims(world.users.founder),
          {
            projectId: documents.a.projectId,
            title: 'Grande',
            kind: 'file',
            file: { name: 'grande.zip', sizeBytes: 200 },
          },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'storage_full' });
    });
  });

  it('freelancers of other projects and clients cannot create documents', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps } = documentsDeps(sql);
      const input = {
        projectId: documents.a.projectId,
        title: 'Briefing',
        kind: 'link' as const,
        url: 'https://example.com',
      };

      for (const claims of [
        documentClaims(world.users.freelancer),
        documentClaims(world.users.decisionMakerA, 'client'),
        documentClaims(world.users.finance),
      ]) {
        expect(await createProjectDocument(claims, input, deps)).toEqual({
          ok: false,
          rule: 'not_found',
        });
      }
    });
  });
});
