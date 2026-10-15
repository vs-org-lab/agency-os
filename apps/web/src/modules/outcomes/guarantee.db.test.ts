import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createOutcomeFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { recordCondition } from './conditions';
import { recordMeasurement } from './measurements';
import { inDays, lisbonToday, outcomeClaims, outcomeDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

async function guarantee(sql: TransactionSql, outcomeId: string) {
  await sql`reset role`;
  const [row] = await sql<
    { status: string; reason: string | null; activated_on: string | null; months_used: number }[]
  >`
    select guarantee_status::text as status, guarantee_reason::text as reason,
           activated_on::text, months_used
    from public.project_outcomes where id = ${outcomeId}
  `;
  return row;
}

async function decisions(sql: TransactionSql, organizationId: string) {
  await sql`reset role`;
  const rows = await sql<{ payload: { status: string; reason: string | null } }[]>`
    select payload from public.domain_events
    where organization_id = ${organizationId} and type = 'outcomes.guarantee.decided'
    order by created_at
  `;
  return rows.map((row) => row.payload);
}

describe('guarantee decisions', () => {
  it(
    'deciding the last condition after the deadline decides the guarantee',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const fixture = await createOutcomeFixture(sql, world);
        await sql`
          update public.project_outcomes set deadline = ${inDays(-1)}
          where id = ${fixture.outcomeId}
        `;
        const { deps, flushes } = outcomeDeps(sql);
        const manager = outcomeClaims(world.users.manager);
        const meet = (conditionId: string) =>
          recordCondition(manager, { conditionId, status: 'met' }, deps);

        await meet(fixture.conditionIds.access);
        await meet(fixture.conditionIds.approvals);
        expect((await guarantee(sql, fixture.outcomeId))?.status).toBe('pending');
        await meet(fixture.conditionIds.mediaBudget);

        expect(await guarantee(sql, fixture.outcomeId)).toEqual({
          status: 'active',
          reason: null,
          activated_on: lisbonToday(),
          months_used: 0,
        });
        expect(await decisions(sql, world.organizationId)).toMatchObject([
          { status: 'active', reason: null },
        ]);
        expect(flushes.length).toBeGreaterThan(0);
      });
    },
    SLOW,
  );

  it(
    'a target reached after the deadline closes the guarantee as it activates',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const fixture = await createOutcomeFixture(sql, world);
        await sql`
          update public.project_outcomes set deadline = ${inDays(-10)}
          where id = ${fixture.outcomeId}
        `;
        await sql`
          insert into public.outcome_measurements (organization_id, client_id, outcome_id,
                                                   measured_on, value)
          values (${world.organizationId}, ${world.clients.a}, ${fixture.outcomeId},
                  ${inDays(-5)}, 62)
        `;
        const { deps } = outcomeDeps(sql);
        const manager = outcomeClaims(world.users.manager);
        for (const conditionId of Object.values(fixture.conditionIds)) {
          await recordCondition(manager, { conditionId, status: 'met' }, deps);
        }

        expect(await guarantee(sql, fixture.outcomeId)).toMatchObject({
          status: 'closed',
          reason: 'target_met',
          activated_on: lisbonToday(),
        });
        expect(await decisions(sql, world.organizationId)).toMatchObject([
          { status: 'closed', reason: 'target_met' },
        ]);
      });
    },
    SLOW,
  );

  it(
    'a late value dated between the deadline and the activation closes the guarantee',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const fixture = await createOutcomeFixture(sql, world);
        await sql`
          update public.project_outcomes
          set deadline = ${inDays(-10)}, guarantee_status = 'active', activated_on = ${inDays(-3)}
          where id = ${fixture.outcomeId}
        `;
        const { deps } = outcomeDeps(sql);

        expect(
          await recordMeasurement(
            outcomeClaims(world.users.manager),
            { outcomeId: fixture.outcomeId, measuredOn: inDays(-5), value: '60' },
            deps,
          ),
        ).toEqual({ ok: true });

        expect(await guarantee(sql, fixture.outcomeId)).toMatchObject({
          status: 'closed',
          reason: 'target_met',
        });
      });
    },
    SLOW,
  );

  it(
    'a value reaching the target closes an active guarantee',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const fixture = await createOutcomeFixture(sql, world);
        await sql`
          update public.project_outcomes
          set deadline = ${inDays(-10)}, guarantee_status = 'active', activated_on = ${inDays(-9)}
          where id = ${fixture.outcomeId}
        `;
        const { deps } = outcomeDeps(sql);
        const record = (value: string) =>
          recordMeasurement(
            outcomeClaims(world.users.manager),
            { outcomeId: fixture.outcomeId, measuredOn: lisbonToday(), value },
            deps,
          );

        expect(await record('59')).toEqual({ ok: true });
        expect((await guarantee(sql, fixture.outcomeId))?.status).toBe('active');
        expect(await record('60')).toEqual({ ok: true });

        expect(await guarantee(sql, fixture.outcomeId)).toMatchObject({
          status: 'closed',
          reason: 'target_met',
          activated_on: inDays(-9),
        });
        expect(await decisions(sql, world.organizationId)).toMatchObject([
          { status: 'closed', reason: 'target_met' },
        ]);
      });
    },
    SLOW,
  );
});
