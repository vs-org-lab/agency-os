import 'server-only';
import { failureHandler, RETRIES } from '@/modules/commercial/server';
import { inngest } from '@/modules/events';
import { withSystemContext, withUserContext } from '@/platform/db';
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

export const TASK_FUNCTIONS = [kickoffTasks];
