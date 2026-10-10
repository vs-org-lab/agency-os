import { and, eq, sql } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import { organizationSender, renderEmail, type EmailPort } from '@/modules/email';
import type { DbContexts } from '@/platform/db';

const { clients, profiles, tasks } = schema;

export type TaskNoticeDeps = {
  contexts: Pick<DbContexts, 'withSystemContext'>;
  email: EmailPort;
  appBaseUrl: string;
};

/**
 * Tells the assignee about a task given to them by someone else. Nothing is sent when the task is
 * done or has meanwhile gone to another person.
 */
export async function sendTaskAssignedNotice(
  taskId: string,
  assigneeId: string,
  deps: TaskNoticeDeps,
): Promise<boolean> {
  const context = await deps.contexts.withSystemContext(async (tx) => {
    const [task] = await tx
      .select({
        organizationId: tasks.organizationId,
        title: tasks.title,
        clientId: tasks.clientId,
        clientName: clients.name,
        dueOn: tasks.dueOn,
        assigneeName: profiles.fullName,
      })
      .from(tasks)
      .leftJoin(clients, eq(clients.id, tasks.clientId))
      .innerJoin(profiles, eq(profiles.id, tasks.assigneeId))
      .where(and(eq(tasks.id, taskId), eq(tasks.assigneeId, assigneeId), eq(tasks.status, 'open')));
    if (!task) return null;
    const rows = await tx.execute<{ email: string | null }>(
      sql`select email from auth.users where id = ${assigneeId}::uuid`,
    );
    return {
      task,
      to: rows[0]?.email ?? null,
      sender: await organizationSender(tx, task.organizationId),
    };
  });
  if (!context?.to) return false;
  const { task, sender } = context;
  const due = task.dueOn
    ? new Intl.DateTimeFormat(sender.defaultLocale, {
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
      }).format(new Date(`${task.dueOn}T00:00:00Z`))
    : 'none';
  const rendered = renderEmail('team.task_assigned', sender.defaultLocale, {
    fullName: task.assigneeName,
    title: task.title,
    scope: task.clientId ? 'client' : 'studio',
    clientName: task.clientName ?? '',
    due,
    taskUrl: `${deps.appBaseUrl}${task.clientId ? `/c/${task.clientId}/tasks` : '/tasks'}`,
  });
  await deps.email.send({
    to: context.to,
    template: 'team.task_assigned',
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    fromName: sender.fromName,
    organizationId: task.organizationId,
  });
  return true;
}
