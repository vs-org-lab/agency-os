import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createBillingFixture,
  createFixtureWorld,
  createRetainerFixture,
  withTestTransaction,
  type World,
} from '@agency-os/db/testing';
import { listTeam } from '@/modules/team/server';
import { reportCsv } from './csv-panels';
import { loadReports } from './readers';
import { reportsClaims, reportsDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

const lisbonToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());

const shift = (days: number) => {
  const date = new Date(`${lisbonToday()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

async function deal(
  sql: TransactionSql,
  world: World,
  input: { code: string; createdAt: string; changes?: [string, string][]; archived?: boolean },
) {
  // A client has at most one open deal, so each deal gets a client of its own.
  const [client] = await sql<{ id: string }[]>`
    insert into public.clients (organization_id, name, lifecycle)
    values (${world.organizationId}, 'Cliente do pipeline', 'prospect')
    returning id
  `;
  const clientId = client?.id ?? '';
  const [row] = await sql<{ id: string }[]>`
    insert into public.deals (organization_id, client_id, title, pipeline_code, source,
                              created_at, archived_at)
    values (${world.organizationId}, ${clientId}, 'Negócio', ${input.code}::app.pipeline_code,
            'acquisition', ${input.createdAt}, ${input.archived ? sql`now()` : null})
    returning id
  `;
  for (const [toCode, at] of input.changes ?? []) {
    await sql`
      insert into public.deal_stage_changes (organization_id, client_id, deal_id, to_code,
                                             created_at)
      values (${world.organizationId}, ${clientId}, ${row?.id ?? ''},
              ${toCode}::app.pipeline_code, ${at})
    `;
  }
}

describe('team reports', () => {
  it(
    'revenue counts reconciled payments of the year and organization',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createBillingFixture(sql, world);
        const year = Number(lisbonToday().slice(0, 4));
        const month = Number(lisbonToday().slice(5, 7)) - 1;

        const reports = await loadReports(
          reportsClaims(world.users.founder),
          year,
          reportsDeps(sql),
        );

        expect(reports?.revenue).toHaveLength(1);
        expect(reports?.revenue[0]).toMatchObject({ currency: 'EUR', total: '6000.00' });
        expect(reports?.revenue[0]?.months[month]).toBe('6000.00');
        expect(
          (await loadReports(reportsClaims(world.users.founder), year - 1, reportsDeps(sql)))
            ?.revenue,
        ).toEqual([]);
      });
    },
    SLOW,
  );

  it(
    'recurring revenue counts active retainers that have started',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        const nextMonth = `${shift(40).slice(0, 7)}-01`;
        const thisMonth = `${lisbonToday().slice(0, 7)}-01`;
        await sql`
          insert into public.retainers (organization_id, client_id, project_id, tier, monthly_fee,
                                        currency, starts_on, review_on, created_by)
          values (${world.organizationId}, ${world.clients.b}, ${retainer.rooms.b.projectId},
                  'Futuro', 900, 'EUR', ${nextMonth}, ${shift(400)}, ${world.users.founder})
        `;
        const [project] = await sql<{ id: string }[]>`
          insert into public.projects (organization_id, client_id, name, template_key,
                                       template_version, starts_on)
          values (${world.organizationId}, ${world.clients.a}, 'Antigo', 'orbit', 1, current_date)
          returning id
        `;
        await sql`
          insert into public.retainers (organization_id, client_id, project_id, tier, monthly_fee,
                                        currency, starts_on, review_on, status, created_by)
          values (${world.organizationId}, ${world.clients.a}, ${project?.id ?? ''}, 'Terminado',
                  700, 'EUR', ${thisMonth}, ${shift(400)}, 'ended', ${world.users.founder})
        `;

        const reports = await loadReports(
          reportsClaims(world.users.founder),
          Number(lisbonToday().slice(0, 4)),
          reportsDeps(sql),
        );

        expect(reports?.recurring).toEqual([{ currency: 'EUR', monthly: '1500.00', retainers: 1 }]);
      });
    },
    SLOW,
  );

  it(
    'pipeline and conversion follow the stage changes of the year',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await deal(sql, world, {
          code: '1.2',
          createdAt: '2026-01-10T10:00:00Z',
          changes: [
            ['1.1', '2026-02-01T10:00:00Z'],
            ['1.2', '2026-02-10T10:00:00Z'],
          ],
        });
        await deal(sql, world, { code: '0.2', createdAt: '2026-03-01T10:00:00Z' });
        await deal(sql, world, {
          code: '2.3',
          createdAt: '2025-11-01T10:00:00Z',
          changes: [
            ['1.1', '2025-12-01T10:00:00Z'],
            ['2.1', '2026-01-15T10:00:00Z'],
            ['2.3', '2026-02-01T10:00:00Z'],
          ],
        });
        await deal(sql, world, { code: '0.1', createdAt: '2026-04-01T10:00:00Z', archived: true });

        const reports = await loadReports(
          reportsClaims(world.users.founder),
          2026,
          reportsDeps(sql),
        );

        expect(reports?.pipeline).toEqual([
          { stage: 'pre_sale', codes: [{ code: '0.2', deals: 1 }] },
          { stage: 'core', codes: [{ code: '1.2', deals: 1 }] },
          { stage: 'orbit', codes: [{ code: '2.3', deals: 1 }] },
        ]);
        expect(reports?.conversion).toEqual([
          { from: 'pre_sale', to: 'core', entered: 2, passed: 1, percent: 50 },
          { from: 'core', to: 'orbit', entered: 1, passed: 0, percent: 0 },
          { from: 'orbit', to: 'gravity', entered: 1, passed: 0, percent: 0 },
          { from: 'gravity', to: 'constellation', entered: 0, passed: 0, percent: null },
        ]);
      });
    },
    SLOW,
  );

  it(
    'team load matches the team screen',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const deps = reportsDeps(sql);
        const claims = reportsClaims(world.users.founder);

        const reports = await loadReports(claims, 2026, deps);
        const team = await listTeam(claims, new Date(), { contexts: deps.contexts });

        const active = (team ?? []).filter((member) => member.status === 'active');
        expect(reports?.load).toHaveLength(active.length);
        expect(reports?.load).toEqual(
          active.map((member) => ({
            userId: member.userId,
            name: member.name,
            tasksThisWeek: member.load.tasksThisWeek,
            activeProjects: member.load.activeProjects,
            weeklyHours: member.rates?.weeklyHours ?? null,
          })),
        );
      });
    },
    SLOW,
  );

  it(
    'at-risk clients come from the latest snapshot with the one from 30 days before',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const snapshot = async (clientId: string, day: string, score: number, level: string) => {
          await sql`
            insert into public.client_health_snapshots (organization_id, client_id, day, score,
                                                        level)
            values (${world.organizationId}, ${clientId}, ${day}, ${score},
                    ${level}::app.health_level)
          `;
        };
        await snapshot(world.clients.a, shift(-30), 60, 'attention');
        await snapshot(world.clients.a, lisbonToday(), 30, 'at_risk');
        await snapshot(world.clients.b, shift(-2), 20, 'at_risk');
        await snapshot(world.clients.b, lisbonToday(), 80, 'healthy');

        const reports = await loadReports(
          reportsClaims(world.users.founder),
          2026,
          reportsDeps(sql),
        );

        expect(reports?.atRisk).toEqual([
          { clientId: world.clients.a, name: expect.any(String), score: 30, scoreBefore: 60 },
        ]);
      });
    },
    SLOW,
  );

  it(
    'only founders load the reports and their csv',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createBillingFixture(sql, world);
        const deps = reportsDeps(sql);
        const year = Number(lisbonToday().slice(0, 4));

        for (const user of [world.users.manager, world.users.finance, world.users.freelancer]) {
          expect(await loadReports(reportsClaims(user), year, deps)).toBeNull();
          expect(await reportCsv(reportsClaims(user), 'revenue', year, deps)).toBeNull();
        }
        const csv = await reportCsv(reportsClaims(world.users.founder), 'revenue', year, deps);
        expect(csv?.filename).toBe(`revenue-${year}.csv`);
        expect(
          csv?.body.startsWith(
            '﻿Moeda,Jan,Fev,Mar,Abr,Mai,Jun,Jul,Ago,Set,Out,Nov,Dez,Total\r\nEUR,',
          ),
        ).toBe(true);
      });
    },
    SLOW,
  );
});
