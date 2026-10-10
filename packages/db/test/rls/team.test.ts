import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asSystem,
  asUser,
  closeTestSql,
  createFixtureWorld,
  createTeamFixture,
  withTestTransaction,
} from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

async function visibleIds(sql: TransactionSql, relation: string, column = 'id'): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    select distinct ${sql(column)} as id from ${sql('public.' + relation)}
  `.catch((error: Error) => {
    if (/permission denied/.test(error.message)) return [];
    throw error;
  });
  return rows.map((row) => row.id).sort();
}

const PROJECT_SCOPED = [
  'project_phases',
  'project_steps',
  'project_updates',
  'approvals',
  'tasks',
] as const;

describe('team access', () => {
  it('freelancer reads only assigned projects and their rows', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const team = await createTeamFixture(sql, world);
      await asUser(sql, world.users.freelancer);

      expect(await visibleIds(sql, 'projects')).toEqual([team.rooms.a.projectId]);
      for (const relation of PROJECT_SCOPED) {
        expect(await visibleIds(sql, relation, 'project_id'), relation).toEqual([
          team.rooms.a.projectId,
        ]);
      }
      expect(await visibleIds(sql, 'tasks')).toContain(team.assignedTaskId);
      expect(await visibleIds(sql, 'tasks')).not.toContain(team.otherTaskId);
    });
  });

  it('manager reads every project of assigned clients', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const team = await createTeamFixture(sql, world);
      await asUser(sql, world.users.manager);

      expect(await visibleIds(sql, 'projects')).toEqual(
        [team.rooms.a.projectId, team.other.projectId].sort(),
      );
      expect(await visibleIds(sql, 'tasks')).toEqual(
        expect.arrayContaining([team.assignedTaskId, team.otherTaskId]),
      );
    });
  });

  it('rates are read by founder and finance only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createTeamFixture(sql, world);

      for (const [userId, expected] of [
        [world.users.founder, 1],
        [world.users.finance, 1],
        [world.users.manager, 0],
        [world.users.freelancer, 0],
        [world.users.decisionMakerA, 0],
      ] as const) {
        await asUser(sql, userId);
        expect((await visibleIds(sql, 'team_member_rates')).length, userId).toBe(expected);
        await asSystem(sql);
      }
    });
  });

  it('assignments are read by founder and the person', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createTeamFixture(sql, world);

      for (const [userId, expected] of [
        [world.users.founder, 1],
        [world.users.freelancer, 1],
        [world.users.manager, 0],
        [world.users.decisionMakerA, 0],
      ] as const) {
        await asUser(sql, userId);
        expect((await visibleIds(sql, 'project_staff_assignments')).length, userId).toBe(expected);
        await asSystem(sql);
      }
      await asUser(sql, world.users.freelancer, { aal: 'aal1' });
      expect(await visibleIds(sql, 'project_staff_assignments')).toEqual([]);
    });
  });

  it('nobody writes team tables directly', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const team = await createTeamFixture(sql, world);
      await asUser(sql, world.users.founder);

      for (const statement of [
        sql`update public.team_member_rates set weekly_hours = 40`,
        sql`delete from public.project_staff_assignments`,
        sql`insert into public.project_staff_assignments (organization_id, client_id, project_id, user_id)
            values (${world.organizationId}, ${world.clients.a}, ${team.other.projectId},
                    ${world.users.freelancer})`,
      ]) {
        await sql`savepoint probe`;
        const result = await statement.catch((error: Error) => error);
        expect(result).toBeInstanceOf(Error);
        await sql`rollback to savepoint probe`;
      }
    });
  });
});
