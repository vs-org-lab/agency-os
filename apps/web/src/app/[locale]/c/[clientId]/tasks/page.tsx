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
} from '../../../(workspace)/tasks/actions';
import { loadPanelData } from '../../../(workspace)/tasks/panel-data';
import { taskPanelActions } from '../../../(workspace)/tasks/panel-actions';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; clientId: string }>;
  searchParams: Promise<{
    assignee?: string;
    status?: string;
    new?: string;
    task?: string;
    sort?: string;
  }>;
};

export default async function RoomTasksPage({ params, searchParams }: PageProps) {
  const { locale: requested, clientId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const options = await loadTaskOptions(session, clientId);
  if (!options) notFound();
  const query = await searchParams;
  const filter = parseTaskFilter(query);
  const sort = parseTaskSort(query.sort);
  const [tasks, counts, panel] = await Promise.all([
    loadTasks(session, { ...filter, clientId }),
    loadTaskCounts(session, { clientId, assigneeId: filter.assigneeId }),
    loadPanelData(session, query.task, clientId),
  ]);
  const clientName = options.clients.find((client) => client.id === clientId)?.name ?? '';
  const t = await getTranslations('tasks');

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('roomDescription')}
        context={<span className="text-caption text-text-secondary">{clientName}</span>}
        actions={
          <TaskCreate
            canCreate={options.canCreate}
            openRequested={query.new === '1'}
            clients={[]}
            people={options.people}
            fixedClientId={clientId}
            create={createTaskAction}
          />
        }
      />
      <TaskFilters
        clients={null}
        people={options.people}
        counts={counts}
        currentUserId={session.claims.sub}
        current={{
          clientId,
          assigneeId: filter.assigneeId ?? null,
          status: filter.status,
        }}
      />
      <div id={TASK_LIST_ID}>
        <TaskTable
          tasks={sortTasks(tasks, sort)}
          today={taskToday(new Date())}
          showClient={false}
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
  return pageMetadata(params, 'shell.room.tasks');
}
