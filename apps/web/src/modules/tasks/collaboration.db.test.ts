import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import {
  closeTestSql,
  createFixtureWorld,
  createLibraryFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import {
  addTaskComment,
  addTaskLink,
  attachTaskFile,
  deleteTaskComment,
  detachTaskFile,
  removeTaskLink,
  taskFilePreviews,
  taskUploadFolder,
} from './collaboration';
import { createTask, listTasks } from './service';
import { taskClaims, taskDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

/** A task in client A's project, assigned to the manager, with the library of that project. */
async function seed(sql: TransactionSql) {
  const world = await createFixtureWorld(sql);
  const library = await createLibraryFixture(sql, world);
  const { deps } = taskDeps(sql);
  const created = await createTask(
    taskClaims(world.users.founder),
    {
      title: 'Preparar entrega',
      clientId: world.clients.a,
      projectId: library.a.projectId,
      assigneeId: world.users.manager,
    },
    deps,
  );
  if (!created.ok) throw new Error('Task was not created');
  return { world, library, deps, taskId: created.taskId };
}

async function count(sql: TransactionSql, table: string, taskId: string): Promise<number> {
  await sql`reset role`;
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count from ${sql('public.' + table)} where task_id = ${taskId}
  `;
  return row?.count ?? 0;
}

describe('task collaboration', () => {
  it('comments need read access', async () => {
    await withTestTransaction(async (sql) => {
      const { world, deps, taskId } = await seed(sql);
      const bTask = await createTask(
        taskClaims(world.users.founder),
        { title: 'Sala B', clientId: world.clients.b },
        deps,
      );
      if (!bTask.ok) throw new Error('Task was not created');

      const stranger = await addTaskComment(
        taskClaims(world.users.freelancer),
        { taskId: bTask.taskId, body: 'Olá' },
        deps,
      );
      const client = await addTaskComment(
        { ...taskClaims(world.users.decisionMakerA), user_kind: 'client' },
        { taskId, body: 'Olá' },
        deps,
      );
      const member = await addTaskComment(
        taskClaims(world.users.manager),
        { taskId, body: '  Pronto  ' },
        deps,
      );

      expect(stranger).toEqual({ ok: false, rule: 'forbidden' });
      expect(client).toEqual({ ok: false, rule: 'forbidden' });
      expect(await count(sql, 'task_comments', bTask.taskId)).toBe(0);
      expect(member.ok).toBe(true);
      const [row] = await sql<{ body: string }[]>`
        select body from public.task_comments where task_id = ${taskId}
      `;
      expect(row?.body).toBe('Pronto');
    });
  });

  it('comments are 1 to 5000 characters', async () => {
    await withTestTransaction(async (sql) => {
      const { world, deps, taskId } = await seed(sql);
      const manager = taskClaims(world.users.manager);

      expect(await addTaskComment(manager, { taskId, body: '   ' }, deps)).toEqual({
        ok: false,
        rule: 'invalid_input',
      });
      expect(await addTaskComment(manager, { taskId, body: 'x'.repeat(5001) }, deps)).toEqual({
        ok: false,
        rule: 'invalid_input',
      });
      expect((await addTaskComment(manager, { taskId, body: 'x'.repeat(5000) }, deps)).ok).toBe(
        true,
      );
    });
  });

  it('author deletes own comment, other manager cannot, founder can and is audited', async () => {
    await withTestTransaction(async (sql) => {
      const { world, deps, taskId } = await seed(sql);
      const founder = taskClaims(world.users.founder);
      const manager = taskClaims(world.users.manager);
      const own = await addTaskComment(manager, { taskId, body: 'Meu' }, deps);
      const theirs = await addTaskComment(founder, { taskId, body: 'Do fundador' }, deps);
      const managerComment = await addTaskComment(manager, { taskId, body: 'Outro' }, deps);
      if (!own.ok || !theirs.ok || !managerComment.ok) throw new Error('Comments not created');

      expect(await deleteTaskComment(manager, { commentId: theirs.id }, deps)).toEqual({
        ok: false,
        rule: 'forbidden',
      });
      expect(await deleteTaskComment(manager, { commentId: own.id }, deps)).toEqual({ ok: true });
      await sql`reset role`;
      const ownAudits = await sql`
        select 1 from public.audit_log where action = 'task.comment_deleted'
          and organization_id = ${world.organizationId}
      `;
      expect(ownAudits).toHaveLength(0);

      expect(await deleteTaskComment(founder, { commentId: managerComment.id }, deps)).toEqual({
        ok: true,
      });
      await sql`reset role`;
      const audits = await sql<{ actor_user_id: string }[]>`
        select metadata ->> 'actorId' as actor_user_id from public.audit_log
        where action = 'task.comment_deleted'
          and organization_id = ${world.organizationId}
      `;
      expect(audits.map((row) => row.actor_user_id)).toEqual([world.users.founder]);
      expect(await count(sql, 'task_comments', taskId)).toBe(1);
    });
  });

  it('links accept only https', async () => {
    await withTestTransaction(async (sql) => {
      const { world, deps, taskId } = await seed(sql);
      const manager = taskClaims(world.users.manager);

      for (const url of [
        'http://example.com',
        'javascript:alert(1)',
        'https://',
        'ftp://example.com',
        `https://example.com/${'a'.repeat(2000)}`,
      ]) {
        expect(await addTaskLink(manager, { taskId, url }, deps), url).toEqual({
          ok: false,
          rule: 'invalid_input',
        });
      }
      expect(
        await addTaskLink(
          manager,
          { taskId, url: 'https://example.com', title: 'x'.repeat(201) },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_input' });
      expect(
        (
          await addTaskLink(
            manager,
            { taskId, url: 'https://example.com/a', title: ' Guia ' },
            deps,
          )
        ).ok,
      ).toBe(true);
      const [row] = await sql<{ title: string }[]>`
        select title from public.task_links where task_id = ${taskId}
      `;
      expect(row?.title).toBe('Guia');
    });
  });

  it('the creator or a founder removes a link, and removal is audited', async () => {
    await withTestTransaction(async (sql) => {
      const { world, deps, taskId } = await seed(sql);
      const founder = taskClaims(world.users.founder);
      const manager = taskClaims(world.users.manager);
      const link = await addTaskLink(founder, { taskId, url: 'https://example.com/a' }, deps);
      if (!link.ok) throw new Error('Link was not created');

      expect(await removeTaskLink(manager, { linkId: link.id }, deps)).toEqual({
        ok: false,
        rule: 'forbidden',
      });
      expect(await removeTaskLink(founder, { linkId: link.id }, deps)).toEqual({ ok: true });
      await sql`reset role`;
      const audits = await sql`
        select 1 from public.audit_log
        where action = 'task.link_removed' and organization_id = ${world.organizationId}
      `;
      expect(audits).toHaveLength(1);
      expect(await removeTaskLink(founder, { linkId: link.id }, deps)).toEqual({
        ok: false,
        rule: 'not_found',
      });
    });
  });

  it("files must belong to the task's project and be readable", async () => {
    await withTestTransaction(async (sql) => {
      const { world, library, deps, taskId } = await seed(sql);
      const manager = taskClaims(world.users.manager);

      expect(
        await attachTaskFile(manager, { taskId, libraryFileId: library.b.rootFileId }, deps),
      ).toEqual({ ok: false, rule: 'invalid_input' });
      expect(
        await attachTaskFile(manager, { taskId, libraryFileId: library.a.uploadingFileId }, deps),
      ).toEqual({ ok: false, rule: 'invalid_input' });
      expect(
        await attachTaskFile(manager, { taskId, libraryFileId: library.a.rootFileId }, deps),
      ).toEqual({ ok: true });
      expect(
        await attachTaskFile(manager, { taskId, libraryFileId: library.a.rootFileId }, deps),
      ).toEqual({ ok: true });
      expect(await count(sql, 'task_files', taskId)).toBe(1);

      const noProject = await createTask(
        taskClaims(world.users.founder),
        { title: 'Sem projeto', clientId: world.clients.a },
        deps,
      );
      if (!noProject.ok) throw new Error('Task was not created');
      expect(
        await attachTaskFile(
          manager,
          { taskId: noProject.taskId, libraryFileId: library.a.rootFileId },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_input' });
    });
  });

  it('a file the user cannot read is refused even on a task they read', async () => {
    await withTestTransaction(async (sql) => {
      const { world, library, deps } = await seed(sql);
      const [row] = await sql<{ id: string }[]>`
        insert into public.tasks (organization_id, client_id, project_id, title, assignee_id,
                                  created_by)
        values (${world.organizationId}, ${world.clients.b}, ${library.b.projectId}, 'Sala B',
                ${world.users.freelancer}, ${world.users.founder})
        returning id
      `;
      if (!row) throw new Error('Task was not created');
      const freelancer = taskClaims(world.users.freelancer);

      expect(
        await attachTaskFile(
          freelancer,
          { taskId: row.id, libraryFileId: library.b.rootFileId },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_input' });
      expect(await count(sql, 'task_files', row.id)).toBe(0);
    });
  });

  it('detaching a file is limited to who attached it or a founder, and audited', async () => {
    await withTestTransaction(async (sql) => {
      const { world, library, deps, taskId } = await seed(sql);
      const founder = taskClaims(world.users.founder);
      const manager = taskClaims(world.users.manager);
      const input = { taskId, libraryFileId: library.a.rootFileId };
      await attachTaskFile(founder, input, deps);

      expect(await detachTaskFile(manager, input, deps)).toEqual({ ok: false, rule: 'forbidden' });
      expect(await detachTaskFile(founder, input, deps)).toEqual({ ok: true });
      expect(await count(sql, 'task_files', taskId)).toBe(0);
      await sql`reset role`;
      const audits = await sql`
        select 1 from public.audit_log
        where action in ('task.file_attached', 'task.file_detached')
          and organization_id = ${world.organizationId}
      `;
      expect(audits).toHaveLength(2);
    });
  });

  it('upload folder is created once and reused', async () => {
    await withTestTransaction(async (sql) => {
      const { world, library, deps, taskId } = await seed(sql);
      const manager = taskClaims(world.users.manager);

      const first = await taskUploadFolder(manager, { taskId }, deps);
      const second = await taskUploadFolder(manager, { taskId }, deps);
      if (!first.ok || !second.ok) throw new Error('Folder was not resolved');

      expect(second.folderId).toBe(first.folderId);
      const [folder] = await sql<{ name: string; visibility: string; project_id: string }[]>`
        select name, visibility::text, project_id from public.library_folders
        where id = ${first.folderId}
      `;
      expect(folder).toEqual({
        name: 'Tarefas',
        visibility: 'internal',
        project_id: library.a.projectId,
      });
      const folders = await sql`
        select 1 from public.library_folders
        where project_id = ${library.a.projectId} and name = 'Tarefas'
      `;
      expect(folders).toHaveLength(1);

      const noProject = await createTask(
        taskClaims(world.users.founder),
        { title: 'Sem projeto', clientId: world.clients.a },
        deps,
      );
      if (!noProject.ok) throw new Error('Task was not created');
      expect(await taskUploadFolder(manager, { taskId: noProject.taskId }, deps)).toEqual({
        ok: false,
        rule: 'invalid_input',
      });
    });
  });

  it("a comment on someone else's task queues one notice without the body", async () => {
    await withTestTransaction(async (sql) => {
      const { world, deps, taskId } = await seed(sql);

      await addTaskComment(
        taskClaims(world.users.founder),
        { taskId, body: 'Segredo comercial' },
        deps,
      );
      await addTaskComment(
        taskClaims(world.users.manager),
        { taskId, body: 'O responsável comenta' },
        deps,
      );

      await sql`reset role`;
      const events = await sql<{ payload: Record<string, string> }[]>`
        select payload from public.domain_events
        where organization_id = ${world.organizationId} and type = 'tasks.task.commented'
      `;
      expect(events).toHaveLength(1);
      expect(events[0]?.payload).toMatchObject({ taskId, assigneeId: world.users.manager });
      expect(JSON.stringify(events[0]?.payload)).not.toContain('Segredo');
    });
  });

  it('file previews list the linked files for those who read the task', async () => {
    await withTestTransaction(async (sql) => {
      const { world, library, deps, taskId } = await seed(sql);
      const manager = taskClaims(world.users.manager);
      for (const libraryFileId of [library.a.rootFileId, library.a.subfolderFileId]) {
        await attachTaskFile(manager, { taskId, libraryFileId }, deps);
      }

      const result = await taskFilePreviews(manager, { taskId }, deps);
      if (!result.ok) throw new Error('Previews were not listed');

      expect(result.files.map((file) => file.id).sort()).toEqual(
        [library.a.rootFileId, library.a.subfolderFileId].sort(),
      );
      expect(result.files.every((file) => file.name.length > 0)).toBe(true);
      expect(
        await taskFilePreviews(
          { ...taskClaims(world.users.decisionMakerA), user_kind: 'client' },
          { taskId },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'forbidden' });
    });
  });

  it('finance reads rooms but cannot comment, link or attach', async () => {
    await withTestTransaction(async (sql) => {
      const { world, library, deps, taskId } = await seed(sql);
      const finance = taskClaims(world.users.finance);
      const attached = taskClaims(world.users.founder);
      await attachTaskFile(attached, { taskId, libraryFileId: library.a.rootFileId }, deps);
      const link = await addTaskLink(attached, { taskId, url: 'https://example.com/a' }, deps);
      if (!link.ok) throw new Error('Link was not created');

      const forbidden = { ok: false, rule: 'forbidden' };
      expect(await addTaskComment(finance, { taskId, body: 'Olá' }, deps)).toEqual(forbidden);
      expect(await addTaskLink(finance, { taskId, url: 'https://example.com/b' }, deps)).toEqual(
        forbidden,
      );
      expect(
        await attachTaskFile(finance, { taskId, libraryFileId: library.a.subfolderFileId }, deps),
      ).toEqual(forbidden);
      expect(
        await detachTaskFile(finance, { taskId, libraryFileId: library.a.rootFileId }, deps),
      ).toEqual(forbidden);
      expect(await count(sql, 'task_comments', taskId)).toBe(0);
      expect(await count(sql, 'task_links', taskId)).toBe(1);
      expect(await count(sql, 'task_files', taskId)).toBe(1);
    });
  });

  it('refuses a client-visible "Tarefas" folder as the upload folder', async () => {
    await withTestTransaction(async (sql) => {
      const { world, library, deps, taskId } = await seed(sql);
      const folderId = randomUUID();
      await sql`
        insert into public.library_folders (id, organization_id, client_id, project_id, root_id, depth,
                                            name, visibility, created_by)
        values (${folderId}, ${world.organizationId}, ${world.clients.a}, ${library.a.projectId},
                ${folderId}, 0, 'tarefas', 'client', ${world.users.founder})
      `;

      expect(await taskUploadFolder(taskClaims(world.users.manager), { taskId }, deps)).toEqual({
        ok: false,
        rule: 'invalid_input',
      });
    });
  });

  it('file count and previews only include ready files the caller reads', async () => {
    await withTestTransaction(async (sql) => {
      const { world, library, deps, taskId } = await seed(sql);
      const manager = taskClaims(world.users.manager);
      for (const libraryFileId of [library.a.rootFileId, library.a.subfolderFileId]) {
        await attachTaskFile(manager, { taskId, libraryFileId }, deps);
      }
      await sql`reset role`;
      await sql`update public.library_files set status = 'uploading' where id = ${library.a.rootFileId}`;

      const [view] = await deps.contexts.withUserContext(manager, (tx) =>
        listTasks(tx, { taskId }),
      );
      const previews = await taskFilePreviews(manager, { taskId }, deps);

      expect(view?.fileCount).toBe(1);
      expect(previews.ok && previews.files.map((file) => file.id)).toEqual([
        library.a.subfolderFileId,
      ]);
    });
  });
});
