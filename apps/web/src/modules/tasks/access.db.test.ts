import { afterAll, describe, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import {
  asSystem,
  asUser,
  closeTestSql,
  createFixtureWorld,
  createLibraryFixture,
  createTaskFixture,
  withTestTransaction,
  type TaskFixture,
  type World,
} from '@agency-os/db/testing';

afterAll(async () => {
  await closeTestSql();
});

const TABLES = ['task_comments', 'task_files', 'task_links'] as const;

async function seedCollaboration(sql: TransactionSql, world: World) {
  const tasks = await createTaskFixture(sql, world);
  const library = await createLibraryFixture(sql, world);
  const taskIds = [
    tasks.clientATaskId,
    tasks.clientBTaskId,
    tasks.studioTaskId,
    tasks.freelancerTaskId,
  ];
  for (const taskId of taskIds) {
    await sql`
      insert into public.task_comments (organization_id, task_id, author_id, body)
      values (${world.organizationId}, ${taskId}, ${world.users.founder}, 'Nota')
    `;
    await sql`
      insert into public.task_links (organization_id, task_id, url, created_by)
      values (${world.organizationId}, ${taskId}, 'https://example.com', ${world.users.founder})
    `;
    await sql`
      insert into public.task_files (task_id, library_file_id, organization_id, created_by)
      values (${taskId}, ${library.a.rootFileId}, ${world.organizationId}, ${world.users.founder})
    `;
  }
  return { tasks, taskIds };
}

async function visibleTaskIds(sql: TransactionSql, table: (typeof TABLES)[number]) {
  const rows = await sql<
    { task_id: string }[]
  >`select task_id from ${sql('public.' + table)}`.catch((error: Error) => {
    if (/permission denied/.test(error.message)) return [];
    throw error;
  });
  return rows.map((row) => row.task_id).sort();
}

describe('task collaboration access', () => {
  it('client users read no comments, files or links', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await seedCollaboration(sql, world);

      for (const user of [
        world.users.decisionMakerA,
        world.users.operationalA,
        world.users.clientFinanceB,
      ]) {
        await asUser(sql, user);
        for (const table of TABLES) expect(await visibleTaskIds(sql, table)).toEqual([]);
        await asSystem(sql);
      }
    });
  });

  it('a freelancer reads them only on tasks they can read', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { tasks } = await seedCollaboration(sql, world);
      await asUser(sql, world.users.freelancer);

      const readable = [tasks.clientATaskId, tasks.freelancerTaskId].sort();
      for (const table of TABLES) expect(await visibleTaskIds(sql, table)).toEqual(readable);
    });
  });

  it('founders read every task and managers their clients and the studio', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { tasks, taskIds } = await seedCollaboration(sql, world);

      await asUser(sql, world.users.founder);
      for (const table of TABLES)
        expect(await visibleTaskIds(sql, table)).toEqual([...taskIds].sort());

      await asSystem(sql);
      await asUser(sql, world.users.manager);
      const managed = [tasks.clientATaskId, tasks.studioTaskId].sort();
      for (const table of TABLES) expect(await visibleTaskIds(sql, table)).toEqual(managed);
    });
  });

  it('another organization reads nothing', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const other = await createFixtureWorld(sql);
      await seedCollaboration(sql, world);
      await asUser(sql, other.users.founder);

      for (const table of TABLES) expect(await visibleTaskIds(sql, table)).toEqual([]);
    });
  });

  it('authenticated cannot insert directly', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { tasks } = await seedCollaboration(sql, world);
      await asUser(sql, world.users.founder);

      const attempts: Record<string, (s: TransactionSql, t: TaskFixture) => Promise<unknown>> = {
        task_comments: (s, t) => s`
          insert into public.task_comments (organization_id, task_id, author_id, body)
          values (${world.organizationId}, ${t.clientATaskId}, ${world.users.founder}, 'x')`,
        task_links: (s, t) => s`
          insert into public.task_links (organization_id, task_id, url)
          values (${world.organizationId}, ${t.clientATaskId}, 'https://example.com/x')`,
        task_files: (s, t) => s`
          insert into public.task_files (task_id, library_file_id, organization_id)
          select ${t.clientATaskId}, id, organization_id from public.library_files limit 1`,
      };
      for (const [table, attempt] of Object.entries(attempts)) {
        await sql`savepoint probe`;
        await expect(attempt(sql, tasks), table).rejects.toThrow(/permission denied/);
        await sql`rollback to savepoint probe`;
      }
    });
  });
});
