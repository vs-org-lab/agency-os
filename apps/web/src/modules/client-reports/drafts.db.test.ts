import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createRetainerFixture,
  testDatabase,
  withTestTransaction,
  type World,
} from '@agency-os/db/testing';
import { createDbContexts } from '@/platform/db';
import { sweepReportDrafts } from './drafts';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 180_000;

async function drafts(sql: TransactionSql, world: World) {
  await sql`reset role`;
  const reports = await sql<{ kind: string; period_start: string; project_id: string }[]>`
    select kind::text, period_start::text, project_id::text from public.client_reports
    where client_id = ${world.clients.a} order by kind, period_start
  `;
  const tasks = await sql<{ title: string; due_on: string; assignee_id: string | null }[]>`
    select title, due_on::text, assignee_id::text from public.tasks
    where client_id = ${world.clients.a} and title like 'Marcar o QBR%'
  `;
  return { reports, tasks };
}

async function retainerFrom(sql: TransactionSql, world: World, startsOn: string) {
  const fixture = await createRetainerFixture(sql, world);
  await sql`update public.retainers set starts_on = ${startsOn} where id = ${fixture.retainerId}`;
  return fixture;
}

describe('client report drafts', () => {
  it(
    'monthly draft for each retainer client',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const fixture = await retainerFrom(sql, world, '2026-06-01');
        const deps = { contexts: createDbContexts(testDatabase(sql)) };

        await sweepReportDrafts('2026-09-01', deps);

        const { reports, tasks } = await drafts(sql, world);
        expect(reports).toEqual([
          {
            kind: 'monthly',
            period_start: '2026-08-01',
            project_id: fixture.rooms.a.projectId,
          },
        ]);
        expect(tasks).toEqual([]);
      });
    },
    SLOW,
  );

  it(
    'quarter close adds the qbr draft and the scheduling task',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await retainerFrom(sql, world, '2026-06-01');
        const deps = { contexts: createDbContexts(testDatabase(sql)) };

        await sweepReportDrafts('2026-10-01', deps);

        const { reports, tasks } = await drafts(sql, world);
        expect(reports.map((report) => [report.kind, report.period_start])).toEqual([
          ['monthly', '2026-09-01'],
          ['qbr', '2026-07-01'],
        ]);
        expect(tasks).toEqual([
          {
            title: 'Marcar o QBR do T3 2026',
            due_on: '2026-10-11',
            assignee_id: world.users.manager,
          },
        ]);
      });
    },
    SLOW,
  );

  it(
    'sweep is idempotent',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await retainerFrom(sql, world, '2026-06-01');
        const deps = { contexts: createDbContexts(testDatabase(sql)) };

        await sweepReportDrafts('2026-10-01', deps);
        await sweepReportDrafts('2026-10-01', deps);
        await sweepReportDrafts('2026-10-02', deps);

        const { reports, tasks } = await drafts(sql, world);
        expect(reports).toHaveLength(2);
        expect(tasks).toHaveLength(1);
      });
    },
    SLOW,
  );

  it(
    'retainer starting after the month is skipped',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await retainerFrom(sql, world, '2026-10-01');
        const deps = { contexts: createDbContexts(testDatabase(sql)) };

        await sweepReportDrafts('2026-10-01', deps);

        expect((await drafts(sql, world)).reports).toEqual([]);
      });
    },
    SLOW,
  );

  it(
    'former clients and ended retainers are skipped',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const fixture = await retainerFrom(sql, world, '2026-06-01');
        const deps = { contexts: createDbContexts(testDatabase(sql)) };
        await sql`update public.clients set lifecycle = 'former' where id = ${world.clients.a}`;

        await sweepReportDrafts('2026-09-01', deps);
        expect((await drafts(sql, world)).reports).toEqual([]);

        await sql`update public.clients set lifecycle = 'active' where id = ${world.clients.a}`;
        await sql`update public.retainers set status = 'ended' where id = ${fixture.retainerId}`;
        await sweepReportDrafts('2026-09-01', deps);
        expect((await drafts(sql, world)).reports).toEqual([]);
      });
    },
    SLOW,
  );
});
