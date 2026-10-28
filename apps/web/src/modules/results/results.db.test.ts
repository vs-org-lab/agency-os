import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import type { ResultsDeps } from './access';
import { archiveKpi, saveKpi } from './kpis';
import { loadClientResults, loadPortalResults } from './readers';
import { currentMonth } from './domain/months';
import { recordKpiValues } from './values';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

function claims(userId: string, kind: 'internal' | 'client' = 'internal'): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: kind === 'internal' ? 'aal2' : 'aal1',
    session_id: randomUUID(),
    amr: [
      { method: kind === 'internal' ? 'totp' : 'otp', timestamp: Math.floor(Date.now() / 1000) },
    ],
    user_kind: kind,
  };
}

function deps(sql: TransactionSql): ResultsDeps {
  return { contexts: createDbContexts(testDatabase(sql)) };
}

function monthsAgo(count: number): string {
  const [year, month] = currentMonth().split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, month - 1 - count, 1));
  return date.toISOString().slice(0, 10);
}

async function values(sql: TransactionSql, kpiId: string) {
  await sql`reset role`;
  return sql<{ month: string; value: string; origin: string }[]>`
    select month::text, value::text, origin::text from public.client_kpi_values
    where kpi_id = ${kpiId} order by month
  `;
}

const LEADS = {
  name: 'Leads qualificados',
  format: 'number' as const,
  aggregation: 'sum' as const,
  source: 'CRM',
  target: '160',
  clientVisible: true,
};

describe('client results', () => {
  it(
    'room writers create indicators; other staff and clients cannot',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const created = await saveKpi(
          claims(world.users.manager),
          { clientId: world.clients.a, ...LEADS },
          deps(sql),
        );
        expect(created).toMatchObject({ ok: true });

        expect(
          await saveKpi(
            claims(world.users.freelancer),
            { clientId: world.clients.a, ...LEADS, name: 'Outro' },
            deps(sql),
          ),
        ).toEqual({ ok: false, rule: 'not_found' });
        expect(
          await saveKpi(
            claims(world.users.decisionMakerA, 'client'),
            { clientId: world.clients.a, ...LEADS, name: 'Outro' },
            deps(sql),
          ),
        ).toEqual({ ok: false, rule: 'not_found' });
        expect(
          await saveKpi(
            claims(world.users.founder),
            { clientId: world.clients.a, ...LEADS },
            deps(sql),
          ),
        ).toEqual({ ok: false, rule: 'duplicate_name' });
      });
    },
    SLOW,
  );

  it(
    'values replace the same month, refuse future months and other clients’ indicators',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const founder = claims(world.users.founder);
        const a = await saveKpi(founder, { clientId: world.clients.a, ...LEADS }, deps(sql));
        const b = await saveKpi(founder, { clientId: world.clients.b, ...LEADS }, deps(sql));
        if (!a.ok || !b.ok) throw new Error('fixture');

        const recorded = await recordKpiValues(
          founder,
          {
            clientId: world.clients.a,
            origin: 'csv',
            values: [
              { kpiId: a.kpiId, month: monthsAgo(1), value: '120' },
              { kpiId: a.kpiId, month: currentMonth(), value: '140.5' },
            ],
          },
          deps(sql),
        );
        expect(recorded).toEqual({ ok: true, count: 2 });

        await recordKpiValues(
          founder,
          {
            clientId: world.clients.a,
            origin: 'manual',
            values: [{ kpiId: a.kpiId, month: currentMonth(), value: '142' }],
          },
          deps(sql),
        );
        expect(await values(sql, a.kpiId)).toEqual([
          { month: monthsAgo(1), value: '120.0000', origin: 'csv' },
          { month: currentMonth(), value: '142.0000', origin: 'manual' },
        ]);

        expect(
          await recordKpiValues(
            founder,
            {
              clientId: world.clients.a,
              origin: 'manual',
              values: [{ kpiId: a.kpiId, month: monthsAgo(-1), value: '1' }],
            },
            deps(sql),
          ),
        ).toEqual({ ok: false, rule: 'invalid_input' });
        expect(
          await recordKpiValues(
            founder,
            {
              clientId: world.clients.a,
              origin: 'manual',
              values: [{ kpiId: b.kpiId, month: currentMonth(), value: '1' }],
            },
            deps(sql),
          ),
        ).toEqual({ ok: false, rule: 'invalid_input' });
      });
    },
    SLOW,
  );

  it(
    'the team reads indicators with their values; clients only read visible ones of their client',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const founder = claims(world.users.founder);
        const leads = await saveKpi(founder, { clientId: world.clients.a, ...LEADS }, deps(sql));
        const internal = await saveKpi(
          founder,
          { clientId: world.clients.a, ...LEADS, name: 'Custo interno', clientVisible: false },
          deps(sql),
        );
        const archived = await saveKpi(
          founder,
          { clientId: world.clients.a, ...LEADS, name: 'Antigo' },
          deps(sql),
        );
        if (!leads.ok || !internal.ok || !archived.ok) throw new Error('fixture');
        await archiveKpi(founder, { kpiId: archived.kpiId }, deps(sql));
        await recordKpiValues(
          founder,
          {
            clientId: world.clients.a,
            origin: 'manual',
            values: [
              { kpiId: leads.kpiId, month: currentMonth(), value: '142' },
              { kpiId: internal.kpiId, month: currentMonth(), value: '9' },
            ],
          },
          deps(sql),
        );

        const team = await loadClientResults(
          claims(world.users.manager),
          world.clients.a,
          deps(sql),
        );
        expect(team?.kpis.map((kpi) => kpi.name)).toEqual(['Leads qualificados', 'Custo interno']);
        expect(team?.kpis[0]?.values).toEqual([{ month: currentMonth(), value: 142 }]);

        const portal = await loadPortalResults(
          claims(world.users.operationalA, 'client'),
          world.clients.a,
          deps(sql),
        );
        expect(portal.map((kpi) => kpi.name)).toEqual(['Leads qualificados']);
        expect(portal[0]?.values).toEqual([{ month: currentMonth(), value: 142 }]);

        expect(
          await loadPortalResults(
            claims(world.users.clientFinanceB, 'client'),
            world.clients.a,
            deps(sql),
          ),
        ).toEqual([]);

        await sql`select set_config('request.jwt.claims', ${JSON.stringify(claims(world.users.decisionMakerA, 'client'))}, true), set_config('role', 'authenticated', true)`;
        const direct = await sql`select id from public.client_kpis`;
        expect(direct).toEqual([]);
      });
    },
    SLOW,
  );
});
