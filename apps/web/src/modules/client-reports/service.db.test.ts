import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asUser,
  closeTestSql,
  createFixtureWorld,
  createRoomFixture,
  withTestTransaction,
  type World,
} from '@agency-os/db/testing';
import { loadClientReport, loadClientReports } from './readers';
import {
  createClientReport,
  previewClientReport,
  saveClientReport,
  shareClientReport,
} from './service';
import { reportClaims, reportDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;
const TEXTS = { summary: 'Um mês de entregas.', highlights: '', nextSteps: 'Lançar o site.' };

async function report(sql: TransactionSql, reportId: string) {
  await sql`reset role`;
  const [row] = await sql<
    { status: string; summary: string; document_id: string | null; data: unknown }[]
  >`
    select status::text, summary, document_id, data from public.client_reports
    where id = ${reportId}
  `;
  return row;
}

async function september(sql: TransactionSql, world: World) {
  const { deps, storage } = reportDeps(sql);
  const manager = reportClaims(world.users.manager);
  const created = await createClientReport(
    manager,
    { clientId: world.clients.a, kind: 'monthly', periodStart: '2026-09-01' },
    deps,
  );
  if (!created.ok) throw new Error('The report was not created');
  return { deps, storage, manager, reportId: created.reportId };
}

describe('client reports service', () => {
  it(
    'create refuses an unfinished period',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        const { deps } = reportDeps(sql);
        const manager = reportClaims(world.users.manager);
        const create = (kind: string, periodStart: string) =>
          createClientReport(manager, { clientId: world.clients.a, kind, periodStart }, deps);

        expect(await create('monthly', '2026-10-01')).toEqual({
          ok: false,
          rule: 'invalid_period',
        });
        expect(await create('qbr', '2026-10-01')).toEqual({ ok: false, rule: 'invalid_period' });
        expect(await create('monthly', '2026-09-02')).toEqual({
          ok: false,
          rule: 'invalid_period',
        });
        expect(await create('weekly', '2026-09-01')).toEqual({
          ok: false,
          rule: 'invalid_period',
        });
        expect(await create('qbr', '2026-07-01')).toMatchObject({ ok: true });
      });
    },
    SLOW,
  );

  it(
    'create refuses a second report for the same period',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        const { deps, manager } = await september(sql, world);

        expect(
          await createClientReport(
            manager,
            { clientId: world.clients.a, kind: 'monthly', periodStart: '2026-09-01' },
            deps,
          ),
        ).toEqual({ ok: false, rule: 'exists' });
      });
    },
    SLOW,
  );

  it(
    'save validates and keeps the texts',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        const { deps, manager, reportId } = await september(sql, world);

        expect(
          await saveClientReport(manager, { reportId, texts: { summary: 'x'.repeat(2001) } }, deps),
        ).toEqual({ ok: false, rule: 'invalid_input' });
        expect(await saveClientReport(manager, { reportId, texts: TEXTS }, deps)).toEqual({
          ok: true,
        });
        expect((await report(sql, reportId))?.summary).toBe('Um mês de entregas.');
      });
    },
    SLOW,
  );

  it(
    'sharing creates the room document with the client',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        const { deps, storage, manager, reportId } = await september(sql, world);
        await saveClientReport(manager, { reportId, texts: TEXTS }, deps);

        const preview = await previewClientReport(manager, reportId, deps);
        expect(preview).toMatchObject({ ok: true, fileName: 'relatorio-2026-09.pdf' });
        const shared = await shareClientReport(manager, reportId, deps);

        expect(shared).toEqual({ ok: true, documentId: reportId });
        const row = await report(sql, reportId);
        expect(row).toMatchObject({ status: 'shared', document_id: reportId });
        expect(row?.data).toMatchObject({ steps: [], updates: [], approvals: [] });
        const [document] = await sql<{ status: string; title: string }[]>`
          select status::text, title from public.project_documents where id = ${reportId}
        `;
        expect(document).toEqual({
          status: 'with_client',
          title: 'Relatório mensal — setembro 2026',
        });
        expect(storage.files.size).toBe(1);
      });
    },
    SLOW,
  );

  it(
    'sharing again adds version 2 to the same document',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        const { deps, manager, reportId } = await september(sql, world);

        await shareClientReport(manager, reportId, deps);
        await saveClientReport(manager, { reportId, texts: TEXTS }, deps);
        expect(await shareClientReport(manager, reportId, deps)).toEqual({
          ok: true,
          documentId: reportId,
        });

        await sql`reset role`;
        const versions = await sql<{ number: number }[]>`
          select number from public.project_document_versions where document_id = ${reportId}
          order by number
        `;
        expect(versions.map((version) => version.number)).toEqual([1, 2]);
        const documents = await sql<{ count: number }[]>`
          select count(*)::int as count from public.project_documents
          where client_id = ${world.clients.a} and kind = 'pdf' and id = ${reportId}
        `;
        expect(documents[0]?.count).toBe(1);
      });
    },
    SLOW,
  );

  it(
    'people outside the room and clients cannot create, save, preview or share',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        const { deps } = reportDeps(sql);
        const founder = reportClaims(world.users.founder);
        const created = await createClientReport(
          founder,
          { clientId: world.clients.b, kind: 'monthly', periodStart: '2026-09-01' },
          deps,
        );
        if (!created.ok) throw new Error('The report was not created');
        const { reportId } = created;
        const NOT_FOUND = { ok: false, rule: 'not_found' };

        for (const claims of [
          reportClaims(world.users.manager),
          reportClaims(world.users.freelancer),
          reportClaims(world.users.clientFinanceB, 'client'),
        ]) {
          expect(
            await createClientReport(
              claims,
              { clientId: world.clients.b, kind: 'qbr', periodStart: '2026-07-01' },
              deps,
            ),
          ).toEqual(NOT_FOUND);
          expect(await saveClientReport(claims, { reportId, texts: TEXTS }, deps)).toEqual(
            NOT_FOUND,
          );
          expect(await previewClientReport(claims, reportId, deps)).toEqual(NOT_FOUND);
          expect(await shareClientReport(claims, reportId, deps)).toEqual(NOT_FOUND);
          expect(await loadClientReport(claims, reportId, deps)).toBeNull();
        }
      });
    },
    SLOW,
  );

  it(
    'clients read the shared document and not the report',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        const { deps, manager, reportId } = await september(sql, world);
        await shareClientReport(manager, reportId, deps);

        await asUser(sql, world.users.decisionMakerA);
        const reports = await sql`select id from public.client_reports`;
        const documents = await sql<{ id: string }[]>`
          select id from public.portal_project_documents where id = ${reportId}
        `;
        expect(reports).toHaveLength(0);
        expect(documents.map((document) => document.id)).toEqual([reportId]);
      });
    },
    SLOW,
  );

  it(
    'the room team lists reports and only writers may write',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        const { deps, manager, reportId } = await september(sql, world);

        const list = await loadClientReports(manager, world.clients.a, deps);
        expect(list).toMatchObject({
          canWrite: true,
          reports: [
            {
              id: reportId,
              kind: 'monthly',
              title: 'Relatório mensal — setembro 2026',
              status: 'draft',
            },
          ],
        });
        const view = await loadClientReport(manager, reportId, deps);
        expect(view).toMatchObject({
          canWrite: true,
          clientId: world.clients.a,
          data: { steps: [], updates: [], approvals: [] },
        });
        expect(
          await loadClientReports(
            reportClaims(world.users.decisionMakerA, 'client'),
            world.clients.a,
            deps,
          ),
        ).toBeNull();
      });
    },
    SLOW,
  );
});
