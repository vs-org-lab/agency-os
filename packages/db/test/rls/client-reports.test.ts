import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asUser,
  closeTestSql,
  createFixtureWorld,
  createRoomFixture,
  withTestTransaction,
  type World,
} from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

async function report(
  sql: TransactionSql,
  world: World,
  input: { clientId: string; projectId: string; kind: string; start: string; end: string },
  extra: { priorities?: string } = {},
) {
  await sql`
    insert into public.client_reports (organization_id, client_id, project_id, kind,
                                       period_start, period_end, priorities)
    values (${world.organizationId}, ${input.clientId}, ${input.projectId},
            ${input.kind}::app.client_report_kind, ${input.start}, ${input.end},
            ${extra.priorities ?? ''})
  `;
}

async function visible(sql: TransactionSql): Promise<string[]> {
  const rows = await sql<{ client_id: string }[]>`
    select client_id::text from public.client_reports
  `;
  return rows.map((row) => row.client_id).sort();
}

describe('client reports', () => {
  it(
    'room readers read reports and clients nothing',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const rooms = await createRoomFixture(sql, world);
        const september = { kind: 'monthly', start: '2026-09-01', end: '2026-09-30' };
        await report(sql, world, {
          clientId: world.clients.a,
          projectId: rooms.a.projectId,
          ...september,
        });
        await report(sql, world, {
          clientId: world.clients.b,
          projectId: rooms.b.projectId,
          ...september,
        });

        await asUser(sql, world.users.founder);
        expect(await visible(sql)).toEqual([world.clients.a, world.clients.b].sort());
        await asUser(sql, world.users.manager);
        expect(await visible(sql)).toEqual([world.clients.a]);
        await asUser(sql, world.users.decisionMakerA);
        expect(await visible(sql)).toEqual([]);
      });
    },
    SLOW,
  );

  it(
    'periods must be whole months or quarters',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const rooms = await createRoomFixture(sql, world);
        const base = { clientId: world.clients.a, projectId: rooms.a.projectId };
        const attempt = (input: { kind: string; start: string; end: string }, priorities = '') =>
          sql.savepoint((tx) =>
            report(tx as TransactionSql, world, { ...base, ...input }, { priorities }),
          );

        await report(sql, world, {
          ...base,
          kind: 'monthly',
          start: '2026-02-01',
          end: '2026-02-28',
        });
        await report(sql, world, { ...base, kind: 'qbr', start: '2026-07-01', end: '2026-09-30' });
        await expect(
          attempt({ kind: 'monthly', start: '2026-03-02', end: '2026-03-31' }),
        ).rejects.toThrow(/client_reports_period/);
        await expect(
          attempt({ kind: 'monthly', start: '2026-03-01', end: '2026-04-30' }),
        ).rejects.toThrow(/client_reports_period/);
        await expect(
          attempt({ kind: 'qbr', start: '2026-02-01', end: '2026-04-30' }),
        ).rejects.toThrow(/client_reports_period/);
        await expect(
          attempt({ kind: 'monthly', start: '2026-05-01', end: '2026-05-31' }, 'Crescer'),
        ).rejects.toThrow(/client_reports_priorities_qbr/);
        await expect(
          sql.savepoint(
            (tx) => tx`
              update public.client_reports set status = 'shared'
              where client_id = ${world.clients.a} and kind = 'qbr'
            `,
          ),
        ).rejects.toThrow(/client_reports_shared_complete/);
      });
    },
    SLOW,
  );

  it(
    'one report per client, kind and period',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const rooms = await createRoomFixture(sql, world);
        const input = {
          clientId: world.clients.a,
          projectId: rooms.a.projectId,
          kind: 'monthly',
          start: '2026-09-01',
          end: '2026-09-30',
        };
        await report(sql, world, input);

        await expect(
          sql.savepoint((tx) => report(tx as TransactionSql, world, input)),
        ).rejects.toThrow(/client_reports_client_period_key/);
      });
    },
    SLOW,
  );

  it(
    'authenticated users cannot write reports',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const rooms = await createRoomFixture(sql, world);
        await asUser(sql, world.users.founder);

        await expect(
          sql.savepoint((tx) =>
            report(tx as TransactionSql, world, {
              clientId: world.clients.a,
              projectId: rooms.a.projectId,
              kind: 'monthly',
              start: '2026-09-01',
              end: '2026-09-30',
            }),
          ),
        ).rejects.toThrow(/permission denied/);
      });
    },
    SLOW,
  );
});
