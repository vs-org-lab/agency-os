import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createOutcomeFixture,
  createRetainerFixture,
  createRoomFixture,
  testDatabase,
  withTestTransaction,
  type World,
} from '@agency-os/db/testing';
import { createDbContexts } from '@/platform/db';
import { collectReportData, reportProject } from './collect';
import { periodOf } from './domain/periods';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;
const SEPTEMBER = periodOf('monthly', '2026-09-15');
const THIRD_QUARTER = periodOf('qbr', '2026-09-15');

const system = (sql: TransactionSql) => createDbContexts(testDatabase(sql)).withSystemContext;

async function approvedDocument(
  sql: TransactionSql,
  world: World,
  input: { clientId: string; projectId: string; title: string; approvedAt: string },
) {
  await sql`
    insert into public.project_documents (organization_id, client_id, project_id, title, kind,
                                          status, approved_at)
    values (${world.organizationId}, ${input.clientId}, ${input.projectId}, ${input.title}, 'link',
            'approved', ${input.approvedAt})
  `;
}

describe('client report data', () => {
  it(
    "collects only the client's period",
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const rooms = await createRoomFixture(sql, world);
        const inSeptember = '2026-09-10 11:00+01';
        for (const step of [rooms.a.visibleStepId, rooms.a.internalStepId, rooms.b.visibleStepId]) {
          await sql`
            update public.project_steps set status = 'done', completed_at = ${inSeptember}
            where id = ${step}
          `;
        }
        await sql`
          update public.project_steps set name = 'Mapa do site' where id = ${rooms.a.visibleStepId}
        `;
        await sql`
          update public.project_updates set created_at = ${inSeptember}, milestone = 'Lançamento'
          where id in (${rooms.a.clientUpdateId}, ${rooms.a.internalUpdateId},
                       ${rooms.b.clientUpdateId})
        `;
        await approvedDocument(sql, world, {
          clientId: world.clients.a,
          projectId: rooms.a.projectId,
          title: 'Identidade',
          approvedAt: '2026-09-20 15:00+01',
        });
        await approvedDocument(sql, world, {
          clientId: world.clients.a,
          projectId: rooms.a.projectId,
          title: 'Fora do mês',
          // 1 October in Lisbon, still 30 September in UTC
          approvedAt: '2026-10-01 00:30+01',
        });

        const data = await system(sql)((tx) =>
          collectReportData(tx, { clientId: world.clients.a, period: SEPTEMBER }),
        );

        expect(data.steps).toEqual([{ name: 'Mapa do site', on: '2026-09-10' }]);
        expect(data.updates).toEqual([{ title: 'Lançamento', on: '2026-09-10' }]);
        expect(data.approvals).toEqual([{ title: 'Identidade', on: '2026-09-20' }]);
      });
    },
    SLOW,
  );

  it(
    'retainer usage per month of a quarter',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const fixture = await createRetainerFixture(sql, world);
        await sql`
          update public.retainers set starts_on = '2026-08-01' where id = ${fixture.retainerId}
        `;
        await sql`
          insert into public.retainer_usage (organization_id, client_id, retainer_id, kind, month,
                                             quantity, description, recorded_by)
          values (${world.organizationId}, ${world.clients.a}, ${fixture.retainerId},
                  'maintenance_hours', '2026-09-01', 6, 'Correções', ${world.users.manager})
        `;

        const data = await system(sql)((tx) =>
          collectReportData(tx, { clientId: world.clients.a, period: THIRD_QUARTER }),
        );

        expect(data.retainer?.map((month) => month.month)).toEqual(['2026-08-01', '2026-09-01']);
        // September carries 20% of August's unused allowance (RN-60)
        const september = data.retainer?.[1]?.limits;
        expect(september).toContainEqual({ kind: 'maintenance_hours', used: 6, available: 12 });
        expect(september).toContainEqual({ kind: 'content_pieces', used: 0, available: 4.8 });
      });
    },
    SLOW,
  );

  it(
    'outcome measurements of the period',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const fixture = await createOutcomeFixture(sql, world);
        await sql`
          update public.outcome_measurements set measured_on = '2026-09-30'
          where id = ${fixture.measurementId}
        `;
        await sql`
          insert into public.outcome_measurements (organization_id, client_id, outcome_id,
                                                   measured_on, value, recorded_by)
          values (${world.organizationId}, ${world.clients.a}, ${fixture.outcomeId}, '2026-08-31',
                  41, ${world.users.manager})
        `;

        const data = await system(sql)((tx) =>
          collectReportData(tx, { clientId: world.clients.a, period: SEPTEMBER }),
        );

        expect(data.outcome).toMatchObject({
          metric: 'Leads por mês',
          baseline: '40.00',
          target: '60.00',
          measurements: [{ on: '2026-09-30', value: '45.00' }],
        });
      });
    },
    SLOW,
  );

  it(
    'no retainer and no outcome give null sections',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);

        const data = await system(sql)((tx) =>
          collectReportData(tx, { clientId: world.clients.b, period: SEPTEMBER }),
        );

        expect(data.retainer).toBeNull();
        expect(data.outcome).toBeNull();
      });
    },
    SLOW,
  );

  it(
    'report project prefers the active retainer',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const fixture = await createRetainerFixture(sql, world);
        const [newer] = await sql<{ id: string }[]>`
          insert into public.projects (organization_id, client_id, name, template_key,
                                       template_version, starts_on, created_at)
          values (${world.organizationId}, ${world.clients.a}, 'Campanha', 'orbit', 1,
                  current_date, now() + interval '1 minute')
          returning id
        `;
        const run = system(sql);

        expect(await run((tx) => reportProject(tx, world.clients.a))).toBe(
          fixture.rooms.a.projectId,
        );
        await sql`update public.retainers set status = 'ended' where id = ${fixture.retainerId}`;
        expect(await run((tx) => reportProject(tx, world.clients.a))).toBe(newer?.id);
        const [roomless] = await sql<{ id: string }[]>`
          insert into public.clients (organization_id, name, lifecycle)
          values (${world.organizationId}, 'Sem sala', 'active')
          returning id
        `;
        expect(await run((tx) => reportProject(tx, roomless?.id ?? ''))).toBeNull();
      });
    },
    SLOW,
  );

  it(
    'report project skips cancelled projects',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const rooms = await createRoomFixture(sql, world);
        await sql`
          insert into public.projects (organization_id, client_id, name, template_key,
                                       template_version, starts_on, status, created_at)
          values (${world.organizationId}, ${world.clients.a}, 'Cancelado', 'orbit', 1,
                  current_date, 'cancelled', now() + interval '1 minute')
        `;

        expect(await system(sql)((tx) => reportProject(tx, world.clients.a))).toBe(
          rooms.a.projectId,
        );
      });
    },
    SLOW,
  );
});
