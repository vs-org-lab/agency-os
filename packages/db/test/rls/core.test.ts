import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asSystem,
  asUser,
  closeTestSql,
  createCoreFixture,
  createFixtureWorld,
  withTestTransaction,
} from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

async function visibleIds(sql: TransactionSql, table: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`select id from ${sql('public.' + table)}`.catch(
    (error: Error) => {
      if (/permission denied/.test(error.message)) return [];
      throw error;
    },
  );
  return rows.map((row) => row.id).sort();
}

async function renameFinding(sql: TransactionSql, findingId: string): Promise<number> {
  const result = await sql`
    update public.core_findings set title = 'Renamed' where id = ${findingId}
  `.catch((error: Error) => {
    if (/permission denied/.test(error.message)) return { count: 0 };
    throw error;
  });
  return result.count;
}

describe('core access', () => {
  it('founder reads and writes the Core of every client', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      await asUser(sql, world.users.founder);

      expect(await visibleIds(sql, 'core_findings')).toEqual(
        [core.a.findingId, core.b.findingId].sort(),
      );
      expect(await renameFinding(sql, core.b.findingId)).toBe(1);
    });
  });

  it('manager writes only the Core of assigned clients', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      await asUser(sql, world.users.manager);

      expect(await visibleIds(sql, 'core_findings')).toEqual([core.a.findingId]);
      expect(await renameFinding(sql, core.a.findingId)).toBe(1);
      expect(await renameFinding(sql, core.b.findingId)).toBe(0);
    });
  });

  it('finance reads but cannot write the Core', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      await asUser(sql, world.users.finance);

      expect(await visibleIds(sql, 'core_engagements')).toEqual(
        [core.a.engagementId, core.b.engagementId].sort(),
      );
      expect(await renameFinding(sql, core.a.findingId)).toBe(0);
    });
  });

  it('portal user sees nothing before sharing', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createCoreFixture(sql, world);
      await asUser(sql, world.users.decisionMakerA);

      expect(await visibleIds(sql, 'portal_core_engagements')).toEqual([]);
      expect(await visibleIds(sql, 'core_briefing_notes')).toEqual([]);
      expect(await visibleIds(sql, 'documents')).toEqual([]);
    });
  });

  it('portal user reads shared briefing notes and documents with the client only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      for (const records of [core.a, core.b]) {
        await sql`update public.core_engagements set briefing_shared_at = now() where id = ${records.engagementId}`;
        await sql`update public.documents set status = 'with_client', shared_at = now() where id = ${records.documentId}`;
      }
      await asUser(sql, world.users.decisionMakerA);

      expect(await visibleIds(sql, 'portal_core_engagements')).toEqual([core.a.engagementId]);
      expect(await visibleIds(sql, 'core_briefing_notes')).toEqual([core.a.noteId]);
      expect(await visibleIds(sql, 'documents')).toEqual([core.a.documentId]);
      await asSystem(sql);
    });
  });

  it('portal user never reads findings, scores or internal columns', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      await sql`update public.core_engagements set briefing_shared_at = now() where id = ${core.a.engagementId}`;
      await asUser(sql, world.users.decisionMakerA);

      expect(await visibleIds(sql, 'core_findings')).toEqual([]);
      expect(await visibleIds(sql, 'core_scores')).toEqual([]);
      expect(await visibleIds(sql, 'core_engagements')).toEqual([]);
      const columns = await sql<{ column_name: string }[]>`
        select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'portal_core_engagements'
      `;
      expect(columns.length).toBeGreaterThan(0);
      for (const internal of ['transcript', 'narrative', 'cross_review_notes']) {
        expect(columns.map((column) => column.column_name)).not.toContain(internal);
      }
    });
  });

  it('staff reads recordings by pipeline access', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);

      await asUser(sql, world.users.founder);
      expect(await visibleIds(sql, 'core_recordings')).toEqual(
        [core.a.recordingId, core.b.recordingId].sort(),
      );
      await asSystem(sql);
      await asUser(sql, world.users.manager);
      expect(await visibleIds(sql, 'core_recordings')).toEqual([core.a.recordingId]);
    });
  });

  it('client users never read recordings', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createCoreFixture(sql, world);
      await asUser(sql, world.users.decisionMakerA);

      expect(await visibleIds(sql, 'core_recordings')).toEqual([]);
    });
  });
});
