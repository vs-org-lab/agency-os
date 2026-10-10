import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asSystem,
  asUser,
  closeTestSql,
  createFixtureWorld,
  createTaskFixture,
  withTestTransaction,
} from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

async function visibleIds(sql: TransactionSql, relation: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`select id from ${sql('public.' + relation)}`.catch(
    (error: Error) => {
      if (/permission denied/.test(error.message)) return [];
      throw error;
    },
  );
  return rows.map((row) => row.id).sort();
}

describe('tasks access', () => {
  it('founder reads all tasks', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const tasks = await createTaskFixture(sql, world);
      await asUser(sql, world.users.founder);

      expect(await visibleIds(sql, 'tasks')).toEqual(
        [
          tasks.clientATaskId,
          tasks.clientBTaskId,
          tasks.studioTaskId,
          tasks.freelancerTaskId,
        ].sort(),
      );
      expect(await visibleIds(sql, 'task_items')).toEqual([tasks.itemId]);
    });
  });

  it('manager reads assigned clients and studio tasks', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const tasks = await createTaskFixture(sql, world);
      await asUser(sql, world.users.manager);

      expect(await visibleIds(sql, 'tasks')).toEqual(
        [tasks.clientATaskId, tasks.studioTaskId].sort(),
      );
    });
  });

  it('freelancer reads own and assigned client tasks only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const tasks = await createTaskFixture(sql, world);
      await asUser(sql, world.users.freelancer);

      expect(await visibleIds(sql, 'tasks')).toEqual(
        [tasks.clientATaskId, tasks.freelancerTaskId].sort(),
      );
      expect(await visibleIds(sql, 'task_items')).toEqual([tasks.itemId]);
    });
  });

  it('clients never read tasks', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createTaskFixture(sql, world);

      for (const user of [
        world.users.decisionMakerA,
        world.users.operationalA,
        world.users.clientFinanceB,
      ]) {
        await asUser(sql, user);
        expect(await visibleIds(sql, 'tasks')).toEqual([]);
        expect(await visibleIds(sql, 'task_items')).toEqual([]);
        await asSystem(sql);
      }
    });
  });

  it('nobody writes tasks directly', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const tasks = await createTaskFixture(sql, world);
      await asUser(sql, world.users.founder);

      await sql`savepoint probe`;
      const updated = await sql`
        update public.tasks set status = 'done' where id = ${tasks.clientATaskId}
      `.catch(() => ({ count: 0 }));
      await sql`rollback to savepoint probe`;
      expect(updated.count).toBe(0);
    });
  });

  it('assignees without mfa or an active membership read nothing', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const tasks = await createTaskFixture(sql, world);
      await asUser(sql, world.users.freelancer, { aal: 'aal1' });
      expect(await visibleIds(sql, 'tasks')).toEqual([]);

      await asSystem(sql);
      await sql`
        update public.organization_memberships set status = 'revoked'
        where user_id = ${world.users.freelancer} and organization_id = ${world.organizationId}
      `;
      await asUser(sql, world.users.freelancer);
      expect(await visibleIds(sql, 'tasks')).not.toContain(tasks.freelancerTaskId);
      expect(await visibleIds(sql, 'tasks')).toEqual([]);
    });
  });
});
