import 'server-only';
import { failureHandler, notificationDeps, RETRIES } from '@/modules/commercial/server';
import { inngest } from '@/modules/events';
import { withSystemContext, withUserContext } from '@/platform/db';
import { sendTaskAssignedNotice, sendTaskCommentNotice } from './notices';
import { createKickoffTasks } from './service';

type ProjectCreatedData = { payload: { projectId?: string; dealId?: string | null } };

/** AUT-13: a project started from 2.2 brings its kickoff and welcome kit tasks. */
const kickoffTasks = inngest.createFunction(
  {
    id: 'tasks-kickoff',
    triggers: [{ event: 'rooms.project.created' }],
    retries: RETRIES,
    onFailure: failureHandler('tasks-kickoff'),
  },
  async ({ event, step }) => {
    const { projectId, dealId } = (event.data as ProjectCreatedData).payload;
    if (!projectId || !dealId) return { created: 0 };
    return step.run('create-kickoff-tasks', () =>
      createKickoffTasks(projectId, { contexts: { withUserContext, withSystemContext } }),
    );
  },
);

type TaskAssignedData = { payload: { taskId?: string; assigneeId?: string } };

/** A task given to someone else reaches them by email. */
const assignedNotice = inngest.createFunction(
  {
    id: 'tasks-assigned-notice',
    triggers: [{ event: 'tasks.task.assigned' }],
    retries: RETRIES,
    onFailure: failureHandler('tasks-assigned-notice'),
  },
  async ({ event, step }) => {
    const { taskId, assigneeId } = (event.data as TaskAssignedData).payload;
    if (!taskId || !assigneeId) return { sent: false };
    const sent = await step.run('send-task-assigned', () => {
      const deps = notificationDeps();
      return sendTaskAssignedNotice(taskId, assigneeId, {
        contexts: { withSystemContext },
        email: deps.email,
        appBaseUrl: deps.appBaseUrl,
      });
    });
    return { sent };
  },
);

type TaskCommentedData = {
  payload: { taskId?: string; assigneeId?: string; authorId?: string };
};

/** A comment from someone else on a task reaches its assignee by email, without the comment text. */
const commentedNotice = inngest.createFunction(
  {
    id: 'tasks-commented-notice',
    triggers: [{ event: 'tasks.task.commented' }],
    retries: RETRIES,
    onFailure: failureHandler('tasks-commented-notice'),
  },
  async ({ event, step }) => {
    const { taskId, assigneeId, authorId } = (event.data as TaskCommentedData).payload;
    if (!taskId || !assigneeId || !authorId) return { sent: false };
    const sent = await step.run('send-task-comment', () => {
      const deps = notificationDeps();
      return sendTaskCommentNotice(
        { taskId, assigneeId, authorId },
        {
          contexts: { withSystemContext },
          email: deps.email,
          appBaseUrl: deps.appBaseUrl,
        },
      );
    });
    return { sent };
  },
);

export const TASK_FUNCTIONS = [kickoffTasks, assignedNotice, commentedNotice];
