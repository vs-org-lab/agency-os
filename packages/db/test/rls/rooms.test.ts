import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asSystem,
  asUser,
  closeTestSql,
  createFixtureWorld,
  createRoomFixture,
  withTestTransaction,
} from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

const BASE_TABLES = ['projects', 'project_phases', 'project_steps', 'project_updates', 'approvals'];

async function visibleIds(sql: TransactionSql, relation: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`select id from ${sql('public.' + relation)}`.catch(
    (error: Error) => {
      if (/permission denied/.test(error.message)) return [];
      throw error;
    },
  );
  return rows.map((row) => row.id).sort();
}

async function writeCount(sql: TransactionSql, statement: Promise<{ count: number }>) {
  await sql`savepoint write_probe`;
  const result = await statement.catch((error: Error) => {
    if (/permission denied|row-level security/.test(error.message)) return { count: 0 };
    throw error;
  });
  await sql`rollback to savepoint write_probe`;
  return result.count;
}

describe('rooms access', () => {
  it('founder and finance read every room', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const rooms = await createRoomFixture(sql, world);

      for (const user of [world.users.founder, world.users.finance]) {
        await asUser(sql, user);
        expect(await visibleIds(sql, 'projects')).toEqual(
          [rooms.a.projectId, rooms.b.projectId].sort(),
        );
        expect(await visibleIds(sql, 'project_updates')).toEqual(
          [
            rooms.a.clientUpdateId,
            rooms.a.internalUpdateId,
            rooms.b.clientUpdateId,
            rooms.b.internalUpdateId,
          ].sort(),
        );
        await asSystem(sql);
      }
    });
  });

  it('manager and freelancer read assigned clients only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const rooms = await createRoomFixture(sql, world);
      await sql`
        insert into public.project_staff_assignments (organization_id, client_id, project_id, user_id)
        values (${world.organizationId}, ${world.clients.a}, ${rooms.a.projectId},
                ${world.users.freelancer})
      `;

      for (const user of [world.users.manager, world.users.freelancer]) {
        await asUser(sql, user);
        expect(await visibleIds(sql, 'projects')).toEqual([rooms.a.projectId]);
        expect(await visibleIds(sql, 'project_steps')).toEqual(
          [rooms.a.visibleStepId, rooms.a.internalStepId].sort(),
        );
        expect(await visibleIds(sql, 'approvals')).toEqual([rooms.a.approvalId]);
        await asSystem(sql);
      }
    });
  });

  it('nobody writes room rows directly', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const rooms = await createRoomFixture(sql, world);
      await asUser(sql, world.users.founder);

      expect(
        await writeCount(
          sql,
          sql`update public.project_steps set status = 'todo' where id = ${rooms.a.visibleStepId}`,
        ),
      ).toBe(0);
      expect(
        await writeCount(
          sql,
          sql`update public.approvals set status = 'approved' where id = ${rooms.a.approvalId}`,
        ),
      ).toBe(0);
      expect(
        await writeCount(sql, sql`delete from public.projects where id = ${rooms.a.projectId}`),
      ).toBe(0);
    });
  });

  it('decision maker and operational read only client-visible items of their room', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const rooms = await createRoomFixture(sql, world);

      for (const user of [world.users.decisionMakerA, world.users.operationalA]) {
        await asUser(sql, user);
        expect(await visibleIds(sql, 'portal_projects')).toEqual([rooms.a.projectId]);
        expect(await visibleIds(sql, 'portal_project_phases')).toEqual(
          [...rooms.a.phaseIds].sort(),
        );
        expect(await visibleIds(sql, 'portal_project_steps')).toEqual([rooms.a.visibleStepId]);
        expect(await visibleIds(sql, 'portal_project_updates')).toEqual([rooms.a.clientUpdateId]);
        expect(await visibleIds(sql, 'portal_approvals')).toEqual([rooms.a.approvalId]);
        for (const table of BASE_TABLES) {
          expect(await visibleIds(sql, table), table).toEqual([]);
        }
        await asSystem(sql);
      }
    });
  });

  it('client finance never reads rooms', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createRoomFixture(sql, world);
      await asUser(sql, world.users.clientFinanceB);

      for (const view of [
        'portal_projects',
        'portal_project_phases',
        'portal_project_steps',
        'portal_project_updates',
        'portal_approvals',
      ]) {
        expect(await visibleIds(sql, view), view).toEqual([]);
      }
    });
  });

  it('cancelled projects leave the portal', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const rooms = await createRoomFixture(sql, world);
      await sql`update public.projects set status = 'cancelled' where id = ${rooms.a.projectId}`;
      await asUser(sql, world.users.decisionMakerA);

      expect(await visibleIds(sql, 'portal_projects')).toEqual([]);
      expect(await visibleIds(sql, 'portal_project_updates')).toEqual([]);
    });
  });
});
