import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createContractFixture,
  createFixtureWorld,
  createOutcomeFixture,
  createRoomFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { addCondition, recordCondition } from './conditions';
import { recordMeasurement } from './measurements';
import { saveOutcome } from './outcomes';
import { loadPortalOutcome } from './portal';
import { loadStaffOutcome } from './readers';
import { inDays, lisbonToday, outcomeClaims, outcomeDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

async function conditions(sql: TransactionSql, outcomeId: string) {
  await sql`reset role`;
  return sql<{ kind: string; status: string; recorded_on: string | null; note: string | null }[]>`
    select kind::text, status::text, recorded_on::text, note from public.outcome_conditions
    where outcome_id = ${outcomeId} order by created_at, kind
  `;
}

async function measurements(sql: TransactionSql, outcomeId: string) {
  await sql`reset role`;
  return sql<{ measured_on: string; value: string }[]>`
    select measured_on::text, value::text from public.outcome_measurements
    where outcome_id = ${outcomeId} order by measured_on
  `;
}

describe('outcomes', () => {
  it(
    'writers create the outcome with the three client conditions',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const rooms = await createRoomFixture(sql, world);
        const { deps } = outcomeDeps(sql);
        const input = {
          clientId: world.clients.a,
          projectId: rooms.a.projectId,
          metric: 'Leads por mês',
          unit: 'leads',
          baseline: '40',
          target: '60',
          deadline: inDays(60),
          dataSource: 'Google Analytics',
        };

        const created = await saveOutcome(outcomeClaims(world.users.founder), input, deps);
        expect(created).toMatchObject({ ok: true });
        const id = created.ok ? created.id : '';
        expect((await conditions(sql, id)).map((row) => [row.kind, row.status])).toEqual([
          ['access', 'pending'],
          ['approvals', 'pending'],
          ['media_budget', 'pending'],
        ]);
        expect(
          await saveOutcome(
            outcomeClaims(world.users.manager),
            { ...input, metric: 'Leads qualificados por mês' },
            deps,
          ),
        ).toEqual({ ok: true, id });
        expect(await conditions(sql, id)).toHaveLength(3);
      });
    },
    SLOW,
  );

  it(
    'outcome input is validated',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const rooms = await createRoomFixture(sql, world);
        const { deps } = outcomeDeps(sql);
        const founder = outcomeClaims(world.users.founder);
        const base = {
          clientId: world.clients.a,
          projectId: rooms.a.projectId,
          metric: 'Leads por mês',
          unit: '',
          baseline: '40',
          target: '60',
          deadline: inDays(60),
          dataSource: 'Google Analytics',
        };

        for (const invalid of [
          { ...base, deadline: lisbonToday() },
          { ...base, target: '40' },
          { ...base, projectId: rooms.b.projectId },
          { ...base, metric: '' },
          { ...base, baseline: 'quarenta' },
        ]) {
          expect(await saveOutcome(founder, invalid, deps), JSON.stringify(invalid)).toEqual({
            ok: false,
            rule: 'invalid_input',
          });
        }
        expect(await saveOutcome(outcomeClaims(world.users.freelancer), base, deps)).toEqual({
          ok: false,
          rule: 'not_found',
        });
      });
    },
    SLOW,
  );

  it(
    'a decided guarantee locks the agreed result',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const fixture = await createOutcomeFixture(sql, world);
        await sql`
          update public.project_outcomes
          set guarantee_status = 'active', activated_on = current_date
          where id = ${fixture.outcomeId}
        `;
        const { deps } = outcomeDeps(sql);
        const current = {
          clientId: world.clients.a,
          projectId: fixture.rooms.a.projectId,
          metric: 'Leads por mês',
          unit: 'leads',
          baseline: '40',
          target: '60',
          deadline: inDays(90),
          dataSource: 'Google Analytics',
        };
        const founder = outcomeClaims(world.users.founder);

        expect(await saveOutcome(founder, { ...current, target: '55' }, deps)).toEqual({
          ok: false,
          rule: 'invalid_state',
        });
        expect(await saveOutcome(founder, { ...current, deadline: inDays(120) }, deps)).toEqual({
          ok: false,
          rule: 'invalid_state',
        });
        expect(
          await saveOutcome(
            founder,
            { ...current, dataSource: 'HubSpot', unit: 'contactos' },
            deps,
          ),
        ).toEqual({ ok: true, id: fixture.outcomeId });
      });
    },
    SLOW,
  );

  it(
    'a failed condition needs a note',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const fixture = await createOutcomeFixture(sql, world);
        const { deps } = outcomeDeps(sql);
        const manager = outcomeClaims(world.users.manager);
        const conditionId = fixture.conditionIds.access;

        expect(await recordCondition(manager, { conditionId, status: 'failed' }, deps)).toEqual({
          ok: false,
          rule: 'invalid_input',
        });
        expect(
          await recordCondition(
            manager,
            { conditionId, status: 'failed', note: 'Acessos chegaram ao fim de 12 dias' },
            deps,
          ),
        ).toEqual({ ok: true });
        expect((await conditions(sql, fixture.outcomeId))[0]).toMatchObject({
          status: 'failed',
          recorded_on: lisbonToday(),
        });
        expect(
          await recordCondition(
            outcomeClaims(world.users.freelancer),
            { conditionId, status: 'met' },
            deps,
          ),
        ).toEqual({ ok: false, rule: 'not_found' });
      });
    },
    SLOW,
  );

  it(
    'conditions are final once the guarantee is decided',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const fixture = await createOutcomeFixture(sql, world);
        await sql`
          update public.project_outcomes
          set guarantee_status = 'not_activated', guarantee_reason = 'target_met'
          where id = ${fixture.outcomeId}
        `;
        const { deps } = outcomeDeps(sql);
        const founder = outcomeClaims(world.users.founder);

        expect(
          await recordCondition(
            founder,
            { conditionId: fixture.conditionIds.approvals, status: 'met' },
            deps,
          ),
        ).toEqual({ ok: false, rule: 'invalid_state' });
        expect(
          await addCondition(
            founder,
            { outcomeId: fixture.outcomeId, description: 'Dados de vendas mensais' },
            deps,
          ),
        ).toEqual({ ok: false, rule: 'invalid_state' });
      });
    },
    SLOW,
  );

  it(
    'one value per date replaces the previous one',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const fixture = await createOutcomeFixture(sql, world);
        const { deps } = outcomeDeps(sql);
        const manager = outcomeClaims(world.users.manager);
        const record = (measuredOn: string, value: string) =>
          recordMeasurement(manager, { outcomeId: fixture.outcomeId, measuredOn, value }, deps);

        expect(await record(lisbonToday(), '50')).toEqual({ ok: true });
        expect(await record(lisbonToday(), '52.5')).toEqual({ ok: true });
        expect(await record(inDays(1), '55')).toEqual({ ok: false, rule: 'invalid_input' });
        expect(await measurements(sql, fixture.outcomeId)).toEqual([
          { measured_on: inDays(-30), value: '45.00' },
          { measured_on: lisbonToday(), value: '52.50' },
        ]);
      });
    },
    SLOW,
  );

  it(
    'only pipeline readers see the proposal guarantee',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const fixture = await createOutcomeFixture(sql, world);
        const contracts = await createContractFixture(sql, world);
        await sql`
          update public.proposals
          set status = 'accepted', accepted_at = now(), accepted_option_id = ${contracts.a.optionId},
              guarantee = 'Até 3 meses de trabalho sem custo se a meta falhar'
          where id = ${contracts.a.proposalId}
        `;
        await sql`
          update public.projects set deal_id = ${contracts.a.dealId}
          where id = ${fixture.rooms.a.projectId}
        `;
        const { deps } = outcomeDeps(sql);
        const load = (userId: string) =>
          loadStaffOutcome(outcomeClaims(userId), world.clients.a, deps);

        expect((await load(world.users.founder))?.proposalGuarantee).toBe(
          'Até 3 meses de trabalho sem custo se a meta falhar',
        );
        expect((await load(world.users.manager))?.proposalGuarantee).toBe(
          'Até 3 meses de trabalho sem custo se a meta falhar',
        );
        expect((await load(world.users.freelancer))?.proposalGuarantee).toBeNull();
      });
    },
    SLOW,
  );

  it(
    'the staff and portal views show the outcome, the portal without notes',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const fixture = await createOutcomeFixture(sql, world);
        const { deps } = outcomeDeps(sql);

        const staff = await loadStaffOutcome(
          outcomeClaims(world.users.founder),
          world.clients.a,
          deps,
        );
        expect(staff).toMatchObject({
          canWrite: true,
          outcome: {
            id: fixture.outcomeId,
            metric: 'Leads por mês',
            baseline: 40,
            target: 60,
            guarantee: { status: 'pending', reason: null, monthsUsed: 0 },
          },
          measurements: [{ measuredOn: inDays(-30), value: 45, note: 'Primeiro mês' }],
        });
        expect(staff?.conditions).toHaveLength(3);
        expect(
          (await loadStaffOutcome(outcomeClaims(world.users.freelancer), world.clients.a, deps))
            ?.canWrite,
        ).toBe(false);

        const portal = await loadPortalOutcome(
          outcomeClaims(world.users.decisionMakerA, 'client'),
          world.clients.a,
          deps,
        );
        expect(portal).toMatchObject({
          outcome: { metric: 'Leads por mês', guarantee: { status: 'pending' } },
          measurements: [{ measuredOn: inDays(-30), value: 45 }],
        });
        expect(JSON.stringify(portal)).not.toContain('Primeiro mês');
        expect(portal?.conditions).toHaveLength(3);
        expect(
          await loadPortalOutcome(
            outcomeClaims(world.users.clientFinanceB, 'client'),
            world.clients.a,
            deps,
          ),
        ).toBeNull();
      });
    },
    SLOW,
  );
});
