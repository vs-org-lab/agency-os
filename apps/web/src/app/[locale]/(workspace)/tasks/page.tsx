import { PageHeader } from '@agency-os/ui/components/page-header';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TaskFilters } from '@/components/tasks/task-filters';
import { TaskCreate } from '@/components/tasks/task-create';
import { TaskList } from '@/components/tasks/task-list';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { parseTaskFilter, taskToday } from '@/modules/tasks';
import { loadTaskCounts, loadTaskOptions, loadTasks } from '@/modules/tasks/server';
import {
  createTaskAction,
  deleteTaskAction,
  setTaskItemAction,
  setTaskStatusAction,
  updateTaskAction,
} from './actions';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ client?: string; assignee?: string; status?: string; new?: string }>;
};

export default async function StudioTasksPage({ params, searchParams }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const query = await searchParams;
  const options = await loadTaskOptions(session, null);
  if (!options) notFound();
  const filter = parseTaskFilter(query);
  const [tasks, counts] = await Promise.all([
    loadTasks(session, filter),
    loadTaskCounts(session, { clientId: filter.clientId, assigneeId: filter.assigneeId }),
  ]);
  const t = await getTranslations('tasks');

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-6">
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
        current={{
          clientId: filter.clientId ?? null,
          assigneeId: filter.assigneeId ?? null,
          status: filter.status,
        }}
      />
      <TaskList
        tasks={tasks}
        today={taskToday(new Date())}
        showClient
        setStatus={setTaskStatusAction}
        setItem={setTaskItemAction}
        edit={{ people: options.people, update: updateTaskAction, remove: deleteTaskAction }}
      />
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'tasks.title');
}
