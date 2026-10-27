import { afterAll, describe, expect, it } from 'vitest';
import { closeTestSql, createFixtureWorld, withTestTransaction } from '@agency-os/db/testing';
import type { EmailPort, OutgoingEmail } from '@/modules/email';
import { sendTaskAssignedNotice, sendTaskCommentNotice } from './notices';
import { createTask } from './service';
import { taskClaims, taskDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

function recordingEmail(): EmailPort & { sent: OutgoingEmail[] } {
  const sent: OutgoingEmail[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}

describe('task notices', () => {
  it('task assigned email names the task and the client', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = taskDeps(sql);
      const created = await createTask(
        taskClaims(world.users.founder),
        {
          title: 'Exportar o logótipo',
          clientId: world.clients.a,
          assigneeId: world.users.freelancer,
          dueOn: '2026-10-16',
        },
        deps,
      );
      if (!created.ok) throw new Error('Task was not created');
      const [client] = await sql<{ name: string }[]>`
        select name from public.clients where id = ${world.clients.a}
      `;
      const [assignee] = await sql<{ email: string }[]>`
        select email from auth.users where id = ${world.users.freelancer}
      `;
      const email = recordingEmail();

      const sent = await sendTaskAssignedNotice(created.taskId, world.users.freelancer, {
        contexts: deps.contexts,
        email,
        appBaseUrl: 'https://os.example.com',
      });

      expect(sent).toBe(true);
      expect(email.sent).toHaveLength(1);
      expect(email.sent[0]).toMatchObject({ to: assignee?.email, template: 'team.task_assigned' });
      expect(email.sent[0]?.text).toContain('Exportar o logótipo');
      expect(email.sent[0]?.text).toContain(client?.name ?? '');
      expect(email.sent[0]?.text).toContain(`https://os.example.com/c/${world.clients.a}/tasks`);
    });
  });

  it('a reassigned or completed task sends nothing', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = taskDeps(sql);
      const created = await createTask(
        taskClaims(world.users.founder),
        { title: 'Rever', assigneeId: world.users.manager },
        deps,
      );
      if (!created.ok) throw new Error('Task was not created');
      const email = recordingEmail();
      const noticeDeps = { contexts: deps.contexts, email, appBaseUrl: 'https://os.example.com' };

      expect(await sendTaskAssignedNotice(created.taskId, world.users.freelancer, noticeDeps)).toBe(
        false,
      );
      await sql`update public.tasks set status = 'done' where id = ${created.taskId}`;
      expect(await sendTaskAssignedNotice(created.taskId, world.users.manager, noticeDeps)).toBe(
        false,
      );
      expect(email.sent).toHaveLength(0);
    });
  });

  it('assigned notices skip members who left', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = taskDeps(sql);
      const created = await createTask(
        taskClaims(world.users.founder),
        { title: 'Rever o mapa', clientId: world.clients.a, assigneeId: world.users.freelancer },
        deps,
      );
      if (!created.ok) throw new Error('Task was not created');
      await sql`
        update public.organization_memberships set status = 'revoked'
        where organization_id = ${world.organizationId} and user_id = ${world.users.freelancer}
      `;
      const email = recordingEmail();

      const sent = await sendTaskAssignedNotice(created.taskId, world.users.freelancer, {
        contexts: deps.contexts,
        email,
        appBaseUrl: 'https://os.example.com',
      });

      expect(sent).toBe(false);
      expect(email.sent).toHaveLength(0);
    });
  });

  it('task comment email names the author and links to the task without the comment', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = taskDeps(sql);
      const created = await createTask(
        taskClaims(world.users.founder),
        { title: 'Rever o mapa', clientId: world.clients.a, assigneeId: world.users.manager },
        deps,
      );
      if (!created.ok) throw new Error('Task was not created');
      const email = recordingEmail();
      const noticeDeps = {
        contexts: deps.contexts,
        email,
        appBaseUrl: 'https://os.example.com',
      };
      const input = {
        taskId: created.taskId,
        assigneeId: world.users.manager,
        authorId: world.users.founder,
      };

      expect(await sendTaskCommentNotice(input, noticeDeps)).toBe(true);
      expect(
        await sendTaskCommentNotice({ ...input, authorId: world.users.manager }, noticeDeps),
      ).toBe(false);

      expect(email.sent).toHaveLength(1);
      expect(email.sent[0]).toMatchObject({ template: 'team.task_comment' });
      expect(email.sent[0]?.text).toContain('Founder');
      expect(email.sent[0]?.text).toContain(
        `https://os.example.com/c/${world.clients.a}/tasks?task=${created.taskId}`,
      );
    });
  });
});
