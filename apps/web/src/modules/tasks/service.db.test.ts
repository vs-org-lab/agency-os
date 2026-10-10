import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createRoomFixture,
  createTeamFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import {
  createKickoffTasks,
  deleteTask,
  createTask,
  listTasks,
  setTaskItem,
  setTaskStatus,
  updateTask,
} from './service';
import { listTaskOptions } from './options';
import { taskClaims, taskDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

describe('tasks', () => {
  it('kickoff tasks are created once and go to the client manager', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const rooms = await createRoomFixture(sql, world);
      const { deps } = taskDeps(sql);

      expect(await createKickoffTasks(rooms.a.projectId, deps)).toEqual({ created: 2 });
      expect(await createKickoffTasks(rooms.a.projectId, deps)).toEqual({ created: 0 });

      const rows = await sql<
        { title: string; source: string; due_on: string; assignee_id: string }[]
      >`
        select title, source::text, due_on::text, assignee_id from public.tasks
        where project_id = ${rooms.a.projectId} order by due_on
      `;
      expect(rows.map((row) => [row.title, row.source, row.assignee_id])).toEqual([
        ['Agendar kickoff', 'kickoff', world.users.manager],
        ['Enviar kit de boas-vindas', 'welcome_kit', world.users.manager],
      ]);
      expect(rows.map((row) => row.due_on)).toEqual(['2026-10-14', '2026-10-19']);
    });
  });

  it('manager cannot create tasks for other clients but can for the studio', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = taskDeps(sql);
      const claims = taskClaims(world.users.manager);

      expect(await createTask(claims, { title: 'Rever', clientId: world.clients.b }, deps)).toEqual(
        {
          ok: false,
          rule: 'not_found',
        },
      );
      expect(
        (await createTask(claims, { title: 'Atualizar portfólio', items: ['Fotos'] }, deps)).ok,
      ).toBe(true);
      expect(await createTask(taskClaims(world.users.freelancer), { title: 'Algo' }, deps)).toEqual(
        { ok: false, rule: 'not_found' },
      );
      expect(await createTask(claims, { title: '   ' }, deps)).toEqual({
        ok: false,
        rule: 'invalid_input',
      });
    });
  });

  it('assignee completes a task they cannot edit and toggles its items', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = taskDeps(sql);
      const created = await createTask(
        taskClaims(world.users.founder),
        {
          title: 'Exportar ficheiros',
          clientId: world.clients.a,
          assigneeId: world.users.freelancer,
          dueOn: '2026-10-13',
          items: ['Logótipo', 'Tipografia'],
        },
        deps,
      );
      if (!created.ok) throw new Error('Task was not created');
      const freelancer = taskClaims(world.users.freelancer);

      expect(
        await updateTask(freelancer, { taskId: created.taskId, title: 'Outro' }, deps),
      ).toEqual({
        ok: false,
        rule: 'not_found',
      });
      const tasks = await deps.contexts.withUserContext(freelancer, (tx) =>
        listTasks(tx, { status: 'open' }),
      );
      const [task] = tasks;
      expect(task?.items.map((item) => item.title)).toEqual(['Logótipo', 'Tipografia']);
      expect(
        await setTaskItem(freelancer, { itemId: task?.items[0]?.id ?? '', done: true }, deps),
      ).toEqual({ ok: true });
      expect(
        await setTaskStatus(freelancer, { taskId: created.taskId, status: 'done' }, deps),
      ).toEqual({
        ok: true,
      });
      const [row] = await sql<{ status: string; completed: boolean }[]>`
        select status::text, completed_at is not null as completed from public.tasks
        where id = ${created.taskId}
      `;
      expect(row).toEqual({ status: 'done', completed: true });
    });
  });

  it('a project task goes to a freelancer only when they are on the project', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const team = await createTeamFixture(sql, world);
      const { deps } = taskDeps(sql);
      const founder = taskClaims(world.users.founder);
      const input = {
        title: 'Rever',
        clientId: world.clients.a,
        assigneeId: world.users.freelancer,
      };

      expect(
        await createTask(founder, { ...input, projectId: team.other.projectId }, deps),
      ).toEqual({ ok: false, rule: 'invalid_input' });
      expect(
        (await createTask(founder, { ...input, projectId: team.rooms.a.projectId }, deps)).ok,
      ).toBe(true);
    });
  });

  it('the assignee must be founder or staff assigned to the client', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = taskDeps(sql);

      expect(
        await createTask(
          taskClaims(world.users.founder),
          { title: 'Rever', clientId: world.clients.b, assigneeId: world.users.freelancer },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_input' });
    });
  });

  it('options list readable clients and who may take the task', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = taskDeps(sql);

      const studio = await listTaskOptions(taskClaims(world.users.manager), null, deps);
      expect(studio?.clients.map((client) => client.id)).toEqual([world.clients.a]);
      expect(studio?.canCreate).toBe(true);
      const roomA = await listTaskOptions(taskClaims(world.users.founder), world.clients.a, deps);
      expect(roomA?.people.map((person) => person.id).sort()).toEqual(
        [world.users.founder, world.users.manager, world.users.freelancer].sort(),
      );
      const roomB = await listTaskOptions(taskClaims(world.users.founder), world.clients.b, deps);
      expect(roomB?.people.map((person) => person.id)).toEqual([world.users.founder]);
      const freelancer = await listTaskOptions(taskClaims(world.users.freelancer), null, deps);
      expect(freelancer?.canCreate).toBe(false);
      expect(await listTaskOptions(taskClaims(world.users.decisionMakerA), null, deps)).toBeNull();
      const studioPeople = await listTaskOptions(taskClaims(world.users.founder), null, deps);
      const clientsOf = (userId: string) =>
        studioPeople?.people.find((person) => person.id === userId)?.clientIds;
      expect(clientsOf(world.users.founder)).toBeNull();
      expect(clientsOf(world.users.freelancer)).toEqual([world.clients.a]);
    });
  });

  it('a task stays editable after its assignee leaves the client', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = taskDeps(sql);
      const founder = taskClaims(world.users.founder);
      const created = await createTask(
        founder,
        { title: 'Rever', clientId: world.clients.a, assigneeId: world.users.freelancer },
        deps,
      );
      if (!created.ok) throw new Error('Task was not created');
      await sql`
        delete from public.client_staff_assignments
        where client_id = ${world.clients.a} and user_id = ${world.users.freelancer}
      `;

      expect(
        await updateTask(
          founder,
          { taskId: created.taskId, title: 'Rever cores', assigneeId: world.users.freelancer },
          deps,
        ),
      ).toEqual({ ok: true });
      expect(
        await updateTask(
          founder,
          { taskId: created.taskId, assigneeId: world.users.manager },
          deps,
        ),
      ).toEqual({ ok: true });
    });
  });

  it('lists whether the reader may edit each task', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = taskDeps(sql);
      await sql`
        insert into public.tasks (organization_id, client_id, title, assignee_id, created_by)
        values (${world.organizationId}, ${world.clients.a}, 'Na sala A', null,
                ${world.users.founder}),
               (${world.organizationId}, ${world.clients.b}, 'Atribuída na sala B',
                ${world.users.manager}, ${world.users.founder})
      `;

      const tasks = await deps.contexts.withUserContext(taskClaims(world.users.manager), (tx) =>
        listTasks(tx, { status: 'open' }),
      );

      expect(Object.fromEntries(tasks.map((task) => [task.title, task.canEdit]))).toEqual({
        'Na sala A': true,
        'Atribuída na sala B': false,
      });
    });
  });

  it('managers delete tasks in their clients only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = taskDeps(sql);
      const own = await createTask(
        taskClaims(world.users.founder),
        { title: 'Apagar', clientId: world.clients.a },
        deps,
      );
      const other = await createTask(
        taskClaims(world.users.founder),
        { title: 'Manter', clientId: world.clients.b },
        deps,
      );
      if (!own.ok || !other.ok) throw new Error('Tasks were not created');
      const manager = taskClaims(world.users.manager);

      expect(await deleteTask(manager, { taskId: other.taskId }, deps)).toEqual({
        ok: false,
        rule: 'not_found',
      });
      expect(await deleteTask(manager, { taskId: own.taskId }, deps)).toEqual({ ok: true });
      const [row] = await sql<{ count: number }[]>`
        select count(*)::int as count from public.tasks where id = ${own.taskId}
      `;
      expect(row?.count).toBe(0);
    });
  });

  it('assigning a task to someone else emits the event', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = taskDeps(sql);
      const created = await createTask(
        taskClaims(world.users.founder),
        { title: 'Rever', clientId: world.clients.a, assigneeId: world.users.freelancer },
        deps,
      );
      if (!created.ok) throw new Error('Task was not created');
      await updateTask(
        taskClaims(world.users.founder),
        { taskId: created.taskId, assigneeId: world.users.manager },
        deps,
      );

      const events = await sql<{ assignee: string }[]>`
        select payload ->> 'assigneeId' as assignee from public.domain_events
        where organization_id = ${world.organizationId} and type = 'tasks.task.assigned'
          and payload ->> 'taskId' = ${created.taskId}
        order by created_at, id
      `;
      expect(events.map((event) => event.assignee).sort()).toEqual(
        [world.users.freelancer, world.users.manager].sort(),
      );
    });
  });

  it('self assignment emits nothing', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = taskDeps(sql);
      const manager = taskClaims(world.users.manager);
      const created = await createTask(
        manager,
        { title: 'Ligar', clientId: world.clients.a, assigneeId: world.users.manager },
        deps,
      );
      if (!created.ok) throw new Error('Task was not created');
      await updateTask(manager, { taskId: created.taskId, title: 'Ligar ao cliente' }, deps);

      const events = await sql`
        select 1 from public.domain_events
        where organization_id = ${world.organizationId} and type = 'tasks.task.assigned'
      `;
      expect(events).toHaveLength(0);
    });
  });
});
