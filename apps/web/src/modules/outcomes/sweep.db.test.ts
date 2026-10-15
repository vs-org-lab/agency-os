import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createOutcomeFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { sweepOutcomes } from './sweep';
import { inDays, lisbonToday, outcomeDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

async function guarantee(sql: TransactionSql, outcomeId: string) {
  await sql`reset role`;
  const [row] = await sql<
    {
      status: string;
      reason: string | null;
      months_used: number;
      conditions_task_for: string | null;
    }[]
  >`
    select guarantee_status::text as status, guarantee_reason::text as reason, months_used,
           conditions_task_for::text
    from public.project_outcomes where id = ${outcomeId}
  `;
  return row;
}

async function decisionCount(sql: TransactionSql, outcomeId: string): Promise<number> {
  const [row] = await sql<{ total: number }[]>`
    select count(*)::int as total from public.domain_events
    where type = 'outcomes.guarantee.decided' and payload->>'outcomeId' = ${outcomeId}
  `;
  return row?.total ?? 0;
}

async function pastDeadline(sql: TransactionSql, outcomeId: string, days = -1) {
  await sql`
    update public.project_outcomes set deadline = ${inDays(days)} where id = ${outcomeId}
  `;
}

async function decideConditions(sql: TransactionSql, outcomeId: string, status: string) {
  await sql`
    update public.outcome_conditions
    set status = ${status}::app.outcome_condition_status, recorded_on = current_date,
        note = case when ${status} = 'failed' then 'Falhou' else null end
    where outcome_id = ${outcomeId}
  `;
}

describe('outcomes sweep', () => {
  it(
    'the sweep activates the guarantee with every condition met',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const fixture = await createOutcomeFixture(sql, world);
        await pastDeadline(sql, fixture.outcomeId);
        await decideConditions(sql, fixture.outcomeId, 'met');
        const { deps } = outcomeDeps(sql);

        await sweepOutcomes(lisbonToday(), deps);

        expect(await guarantee(sql, fixture.outcomeId)).toMatchObject({
          status: 'active',
          reason: null,
          months_used: 0,
        });
        expect(await decisionCount(sql, fixture.outcomeId)).toBe(1);
      });
    },
    SLOW,
  );

  it(
    'the sweep does not activate when the target was met or a condition failed',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const reached = await createOutcomeFixture(sql, world);
        const failed = await createOutcomeFixture(sql, world);
        for (const fixture of [reached, failed]) await pastDeadline(sql, fixture.outcomeId, -5);
        await decideConditions(sql, reached.outcomeId, 'met');
        await sql`
          insert into public.outcome_measurements (organization_id, client_id, outcome_id,
                                                   measured_on, value)
          values (${world.organizationId}, ${world.clients.a}, ${reached.outcomeId},
                  ${inDays(-6)}, 61)
        `;
        await decideConditions(sql, failed.outcomeId, 'met');
        await sql`
          update public.outcome_conditions set status = 'failed', note = 'Sem acessos'
          where id = ${failed.conditionIds.access}
        `;
        const { deps } = outcomeDeps(sql);

        await sweepOutcomes(lisbonToday(), deps);

        expect(await guarantee(sql, reached.outcomeId)).toMatchObject({
          status: 'not_activated',
          reason: 'target_met',
        });
        expect(await guarantee(sql, failed.outcomeId)).toMatchObject({
          status: 'not_activated',
          reason: 'conditions_failed',
        });
      });
    },
    SLOW,
  );

  it(
    'pending conditions at the deadline create one task',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const fixture = await createOutcomeFixture(sql, world);
        await pastDeadline(sql, fixture.outcomeId);
        const { deps } = outcomeDeps(sql);

        await sweepOutcomes(lisbonToday(), deps);
        await sweepOutcomes(lisbonToday(), deps);

        expect(await guarantee(sql, fixture.outcomeId)).toMatchObject({
          status: 'pending',
          conditions_task_for: inDays(-1),
        });
        const tasks = await sql<{ title: string; assignee_id: string | null }[]>`
          select title, assignee_id from public.tasks
          where project_id = ${fixture.rooms.a.projectId}
            and title like 'Decidir as condições do resultado de %'
        `;
        expect(tasks).toHaveLength(1);
        expect(tasks[0]?.assignee_id).toBe(world.users.manager);
        expect(await decisionCount(sql, fixture.outcomeId)).toBe(0);
      });
    },
    SLOW,
  );

  it(
    'the sweep decides once and counts months idempotently',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const fixture = await createOutcomeFixture(sql, world);
        await sql`
          update public.project_outcomes
          set deadline = ${inDays(-120)}, guarantee_status = 'active', activated_on = ${inDays(-35)}
          where id = ${fixture.outcomeId}
        `;
        await sql`delete from public.outcome_measurements where outcome_id = ${fixture.outcomeId}`;
        const { deps } = outcomeDeps(sql);

        await sweepOutcomes(lisbonToday(), deps);
        await sweepOutcomes(lisbonToday(), deps);
        expect(await guarantee(sql, fixture.outcomeId)).toMatchObject({
          status: 'active',
          months_used: 1,
        });
        expect(await decisionCount(sql, fixture.outcomeId)).toBe(0);

        await sql`
          update public.project_outcomes set activated_on = ${inDays(-95)}
          where id = ${fixture.outcomeId}
        `;
        await sweepOutcomes(lisbonToday(), deps);
        await sweepOutcomes(lisbonToday(), deps);

        expect(await guarantee(sql, fixture.outcomeId)).toMatchObject({
          status: 'closed',
          reason: 'months_used',
          months_used: 3,
        });
        expect(await decisionCount(sql, fixture.outcomeId)).toBe(1);
      });
    },
    SLOW,
  );
});
