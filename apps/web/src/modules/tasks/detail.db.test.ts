import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createLibraryFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { addTaskComment, addTaskLink, attachTaskFile } from './collaboration';
import { loadTaskDetail } from './detail';
import { createTask } from './service';
import { taskClaims, taskDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

describe('task detail', () => {
  it('detail returns null when unreadable', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = taskDeps(sql);
      const created = await createTask(
        taskClaims(world.users.founder),
        { title: 'Sala B', clientId: world.clients.b },
        deps,
      );
      if (!created.ok) throw new Error('Task was not created');

      expect(
        await loadTaskDetail(taskClaims(world.users.freelancer), created.taskId, deps),
      ).toBeNull();
      expect(await loadTaskDetail(taskClaims(world.users.founder), 'not-a-uuid', deps)).toBeNull();
      expect(
        await loadTaskDetail(
          taskClaims(world.users.founder),
          '00000000-0000-4000-8000-000000000000',
          deps,
        ),
      ).toBeNull();
    });
  });

  it('detail lists comments, files and links with what the reader may remove', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const library = await createLibraryFixture(sql, world);
      const { deps } = taskDeps(sql);
      const founder = taskClaims(world.users.founder);
      const manager = taskClaims(world.users.manager);
      const created = await createTask(
        founder,
        {
          title: 'Preparar entrega',
          clientId: world.clients.a,
          projectId: library.a.projectId,
          assigneeId: world.users.manager,
          items: ['Rever'],
        },
        deps,
      );
      if (!created.ok) throw new Error('Task was not created');
      const { taskId } = created;
      await addTaskComment(founder, { taskId, body: 'Do fundador' }, deps);
      await addTaskComment(manager, { taskId, body: 'Do gestor' }, deps);
      await addTaskLink(founder, { taskId, url: 'https://example.com/a', title: 'Guia' }, deps);
      await attachTaskFile(founder, { taskId, libraryFileId: library.a.rootFileId }, deps);

      const asManager = await loadTaskDetail(manager, taskId, deps);
      const asFounder = await loadTaskDetail(founder, taskId, deps);

      expect(asManager).toMatchObject({ id: taskId, title: 'Preparar entrega', canEdit: true });
      expect(asManager?.items.map((item) => item.title)).toEqual(['Rever']);
      // Both comments share the transaction's timestamp, so their order is not defined here.
      const byAuthor = asManager?.comments
        .map((c) => [c.authorName, c.body, c.canDelete])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      expect(byAuthor).toEqual([
        ['Founder', 'Do fundador', false],
        ['Manager', 'Do gestor', true],
      ]);
      expect(asManager?.files).toEqual([
        { id: library.a.rootFileId, name: 'manual.png', mimeType: 'image/png', canDetach: false },
      ]);
      expect(asManager?.links).toEqual([
        {
          id: expect.any(String),
          url: 'https://example.com/a',
          title: 'Guia',
          canRemove: false,
        },
      ]);
      expect(asFounder?.comments.map((c) => c.canDelete)).toEqual([true, true]);
      expect(asFounder?.files[0]?.canDetach).toBe(true);
      expect(asFounder?.links[0]?.canRemove).toBe(true);
    });
  });
});
