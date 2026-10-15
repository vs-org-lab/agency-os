import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asUser,
  closeTestSql,
  createFixtureWorld,
  createOutcomeFixture,
  withTestTransaction,
} from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

async function visible(sql: TransactionSql, relation: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    select id::text as id from ${sql('public.' + relation)}
  `.catch((error: Error) => {
    if (/permission denied/.test(error.message)) return [];
    throw error;
  });
  return rows.map((row) => row.id).sort();
}

describe('outcome access', () => {
  it(
    'room readers read outcomes, other clients and outsiders nothing',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const outcome = await createOutcomeFixture(sql, world);

        for (const user of [
          world.users.founder,
          world.users.manager,
          world.users.finance,
          world.users.freelancer,
        ]) {
          await asUser(sql, user);
          expect(await visible(sql, 'project_outcomes')).toEqual([outcome.outcomeId]);
          expect(await visible(sql, 'outcome_conditions')).toHaveLength(3);
          expect(await visible(sql, 'outcome_measurements')).toEqual([outcome.measurementId]);
        }
        for (const user of [world.users.decisionMakerA, world.users.clientFinanceB]) {
          await asUser(sql, user);
          expect(await visible(sql, 'project_outcomes')).toEqual([]);
          expect(await visible(sql, 'outcome_conditions')).toEqual([]);
        }
      });
    },
    SLOW,
  );

  it(
    "portal views show the client's outcome without internal notes",
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const outcome = await createOutcomeFixture(sql, world);

        for (const user of [world.users.decisionMakerA, world.users.operationalA]) {
          await asUser(sql, user);
          expect(await visible(sql, 'portal_project_outcomes')).toEqual([outcome.outcomeId]);
          expect(await visible(sql, 'portal_outcome_conditions')).toHaveLength(3);
          expect(await visible(sql, 'portal_outcome_measurements')).toEqual([
            outcome.measurementId,
          ]);
        }
        const [condition] = await sql<Record<string, unknown>[]>`
          select * from public.portal_outcome_conditions limit 1
        `;
        expect(Object.keys(condition ?? {})).not.toContain('note');
        expect(Object.keys(condition ?? {})).not.toContain('recorded_by');
        const [measurement] = await sql<Record<string, unknown>[]>`
          select * from public.portal_outcome_measurements limit 1
        `;
        expect(Object.keys(measurement ?? {})).not.toContain('note');
        await asUser(sql, world.users.clientFinanceB);
        expect(await visible(sql, 'portal_project_outcomes')).toEqual([]);
      });
    },
    SLOW,
  );

  it(
    'the guarantee state is consistent',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const outcome = await createOutcomeFixture(sql, world);
        const update = (fields: string) =>
          sql.savepoint((tx) =>
            tx.unsafe(`update public.project_outcomes set ${fields} where id = $1`, [
              outcome.outcomeId,
            ]),
          );

        for (const invalid of [
          "guarantee_status = 'pending', guarantee_reason = 'target_met'",
          "guarantee_status = 'not_activated', guarantee_reason = null",
          "guarantee_status = 'not_activated', guarantee_reason = 'months_used'",
          "guarantee_status = 'closed', guarantee_reason = 'conditions_failed', activated_on = current_date",
          "guarantee_status = 'active', activated_on = null",
          'activated_on = current_date',
          "guarantee_status = 'active', activated_on = current_date, months_used = 4",
          "guarantee_status = 'closed', guarantee_reason = 'months_used', activated_on = current_date, months_used = 2",
        ]) {
          await expect(update(invalid), invalid).rejects.toThrow(/project_outcomes_/);
        }
        await update("guarantee_status = 'active', activated_on = current_date, months_used = 1");
        await update(
          "guarantee_status = 'closed', guarantee_reason = 'months_used', months_used = 3",
        );
      });
    },
    SLOW,
  );

  it(
    'one value per date and baseline different from target',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const outcome = await createOutcomeFixture(sql, world);

        await expect(
          sql.savepoint(
            (tx) =>
              tx`update public.project_outcomes set target = baseline where id = ${outcome.outcomeId}`,
          ),
        ).rejects.toThrow(/project_outcomes_target_differs/);
        await expect(
          sql.savepoint(
            (tx) => tx`
              insert into public.outcome_measurements (organization_id, client_id, outcome_id,
                                                       measured_on, value)
              select organization_id, client_id, outcome_id, measured_on, 50
              from public.outcome_measurements where id = ${outcome.measurementId}
            `,
          ),
        ).rejects.toThrow(/outcome_measurements_outcome_date_key/);
        await expect(
          sql.savepoint(
            (tx) => tx`
              update public.outcome_conditions set status = 'failed', note = null
              where id = ${outcome.conditionIds.access}
            `,
          ),
        ).rejects.toThrow(/outcome_conditions_failed_note/);
      });
    },
    SLOW,
  );

  it(
    'authenticated users cannot write outcomes',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const outcome = await createOutcomeFixture(sql, world);
        await asUser(sql, world.users.founder);

        await expect(
          sql.savepoint(
            (tx) =>
              tx`update public.project_outcomes set metric = 'X' where id = ${outcome.outcomeId}`,
          ),
        ).rejects.toThrow(/permission denied/);
        await expect(
          sql.savepoint(
            (tx) => tx`delete from public.outcome_measurements where id = ${outcome.measurementId}`,
          ),
        ).rejects.toThrow(/permission denied/);
      });
    },
    SLOW,
  );
});
