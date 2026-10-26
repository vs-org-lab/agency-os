import { PageHeader } from '@agency-os/ui/components/page-header';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TASK_LIST_ID, TaskFilters } from '@/components/tasks/task-filters';
import { TaskCreate } from '@/components/tasks/task-create';
import { TaskPanel } from '@/components/tasks/task-panel';
import { TaskTable } from '@/components/tasks/task-table';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { parseTaskFilter, parseTaskSort, sortTasks, taskToday } from '@/modules/tasks';
import { loadTaskCounts, loadTaskOptions, loadTasks } from '@/modules/tasks/server';
import {
  addTaskItemAction,
  createTaskAction,
  setTaskItemAction,
  setTaskStatusAction,
} from './actions';
import { loadPanelData } from './panel-data';
import { taskPanelActions } from './panel-actions';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    client?: string;
    assignee?: string;
    status?: string;
    new?: string;
    task?: string;
    sort?: string;
  }>;
};

export default async function StudioTasksPage({ params, searchParams }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const query = await searchParams;
  const options = await loadTaskOptions(session, null);
  if (!options) notFound();
  const filter = parseTaskFilter(query);
  const sort = parseTaskSort(query.sort);
  const [tasks, counts, panel] = await Promise.all([
    loadTasks(session, filter),
    loadTaskCounts(session, { clientId: filter.clientId, assigneeId: filter.assigneeId }),
    loadPanelData(session, query.task, null),
  ]);
  const t = await getTranslations('tasks');

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <TaskCreate
            canCreate={options.canCreate}
            openRequested={query.new === '1'}
            clients={options.clients}
            people={options.people}
            fixedClientId={null}
            create={createTaskAction}
          />
        }
      />
      <TaskFilters
        clients={options.clients}
        people={options.people}
        counts={counts}
        currentUserId={session.claims.sub}
        current={{
          clientId: filter.clientId ?? null,
          assigneeId: filter.assigneeId ?? null,
          status: filter.status,
        }}
      />
      <div id={TASK_LIST_ID}>
        <TaskTable
          tasks={sortTasks(tasks, sort)}
          today={taskToday(new Date())}
          showClient={true}
          sort={sort}
          setStatus={setTaskStatusAction}
          setItem={setTaskItemAction}
          addItem={addTaskItemAction}
        />
      </div>
      <TaskPanel
        detail={panel.detail}
        people={options.people}
        attachable={panel.attachable}
        actions={taskPanelActions}
      />
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'tasks.title');
}
