import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createRoomFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createPdf } from '@/platform/pdf';
import { publishGeneratedPdf } from './publish';
import { documentClaims, documentsDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

async function onePagePdf(): Promise<Uint8Array> {
  const { document, writer } = await createPdf({ title: 'Relatório' });
  writer.paragraph('Relatório mensal');
  return document.save();
}

async function documentState(sql: TransactionSql, documentId: string) {
  await sql`reset role`;
  const [document] = await sql<{ status: string; kind: string; title: string }[]>`
    select status::text, kind::text, title from public.project_documents where id = ${documentId}
  `;
  const versions = await sql<
    { number: number; upload_status: string; shared: boolean; pages: number; path: string }[]
  >`
    select v.number, v.upload_status::text, v.shared_at is not null as shared, v.pages,
           v.storage_path as path
    from public.project_document_versions v
    where v.document_id = ${documentId} order by v.number
  `;
  const events = await sql<{ count: number }[]>`
    select count(*)::int as count from public.domain_events
    where type = 'rooms.document.shared' and payload ->> 'documentId' = ${documentId}
  `;
  return { document, versions, shared: events[0]?.count ?? 0 };
}

describe('generated pdf publication', () => {
  it(
    'publishes a new pdf document with the client',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const rooms = await createRoomFixture(sql, world);
        const { deps, storage, flushes } = documentsDeps(sql);
        const bytes = await onePagePdf();

        const result = await publishGeneratedPdf(
          documentClaims(world.users.manager),
          {
            projectId: rooms.a.projectId,
            documentId: randomUUID(),
            title: 'Relatório mensal — setembro 2026',
            fileName: 'relatorio-2026-09.pdf',
            bytes,
          },
          deps,
        );

        if (!result.ok) throw new Error('The pdf was not published');
        const state = await documentState(sql, result.documentId);
        expect(state.document).toEqual({
          status: 'with_client',
          kind: 'pdf',
          title: 'Relatório mensal — setembro 2026',
        });
        expect(state.versions).toMatchObject([
          { number: 1, upload_status: 'ready', shared: true, pages: 1 },
        ]);
        expect(storage.files.get(state.versions[0]?.path ?? '')).toEqual(bytes);
        expect(state.shared).toBe(1);
        expect(flushes).toHaveLength(1);
      });
    },
    SLOW,
  );

  it(
    'a second publication adds version 2 and keeps it with the client',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const rooms = await createRoomFixture(sql, world);
        const { deps } = documentsDeps(sql);
        const manager = documentClaims(world.users.manager);
        const input = {
          projectId: rooms.a.projectId,
          title: 'QBR — T3 2026',
          fileName: 'qbr-2026-t3.pdf',
          bytes: await onePagePdf(),
        };

        const first = await publishGeneratedPdf(
          manager,
          { ...input, documentId: randomUUID() },
          deps,
        );
        if (!first.ok) throw new Error('The pdf was not published');
        const second = await publishGeneratedPdf(
          manager,
          { ...input, documentId: first.documentId },
          deps,
        );

        expect(second).toMatchObject({ ok: true, documentId: first.documentId });
        const state = await documentState(sql, first.documentId);
        expect(state.document?.status).toBe('with_client');
        expect(state.versions.map((version) => [version.number, version.shared])).toEqual([
          [1, true],
          [2, true],
        ]);
        expect(state.shared).toBe(2);
      });
    },
    SLOW,
  );

  it(
    'a removed document is published again under the same id',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const rooms = await createRoomFixture(sql, world);
        const { deps } = documentsDeps(sql);
        const manager = documentClaims(world.users.manager);
        const input = {
          projectId: rooms.a.projectId,
          title: 'Relatório mensal — setembro 2026',
          fileName: 'relatorio-2026-09.pdf',
          bytes: await onePagePdf(),
        };
        const first = await publishGeneratedPdf(
          manager,
          { ...input, documentId: randomUUID() },
          deps,
        );
        if (!first.ok) throw new Error('The pdf was not published');
        await sql`reset role`;
        await sql`delete from public.project_documents where id = ${first.documentId}`;

        const again = await publishGeneratedPdf(
          manager,
          { ...input, documentId: first.documentId },
          deps,
        );

        expect(again).toMatchObject({ ok: true, documentId: first.documentId });
        const state = await documentState(sql, first.documentId);
        expect(state.versions.map((version) => version.number)).toEqual([1]);
      });
    },
    SLOW,
  );

  it(
    'only document editors publish',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const rooms = await createRoomFixture(sql, world);
        const { deps, storage } = documentsDeps(sql);
        const input = {
          documentId: randomUUID(),
          title: 'Relatório',
          fileName: 'relatorio.pdf',
          bytes: await onePagePdf(),
        };

        expect(
          await publishGeneratedPdf(
            documentClaims(world.users.decisionMakerA, 'client'),
            { ...input, projectId: rooms.a.projectId },
            deps,
          ),
        ).toEqual({ ok: false, rule: 'not_found' });
        expect(
          await publishGeneratedPdf(
            documentClaims(world.users.manager),
            { ...input, projectId: rooms.b.projectId },
            deps,
          ),
        ).toEqual({ ok: false, rule: 'not_found' });
        expect(storage.files.size).toBe(0);
      });
    },
    SLOW,
  );

  it(
    'a document id of another project is not reused',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const rooms = await createRoomFixture(sql, world);
        const { deps, storage } = documentsDeps(sql);
        const input = { title: 'Relatório', fileName: 'relatorio.pdf', bytes: await onePagePdf() };
        const theirs = await publishGeneratedPdf(
          documentClaims(world.users.founder),
          { ...input, projectId: rooms.b.projectId, documentId: randomUUID() },
          deps,
        );
        if (!theirs.ok) throw new Error('The pdf was not published');

        expect(
          await publishGeneratedPdf(
            documentClaims(world.users.manager),
            { ...input, projectId: rooms.a.projectId, documentId: theirs.documentId },
            deps,
          ),
        ).toEqual({ ok: false, rule: 'not_found' });
        expect(storage.files.size).toBe(1);
        expect((await documentState(sql, theirs.documentId)).versions).toHaveLength(1);
      });
    },
    SLOW,
  );
});
