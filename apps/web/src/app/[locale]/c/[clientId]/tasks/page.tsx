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
} from '../../../(workspace)/tasks/actions';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; clientId: string }>;
  searchParams: Promise<{ assignee?: string; status?: string; new?: string }>;
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
  const [tasks, counts] = await Promise.all([
    loadTasks(session, { ...filter, clientId }),
    loadTaskCounts(session, { clientId, assigneeId: filter.assigneeId }),
  ]);
  const clientName = options.clients.find((client) => client.id === clientId)?.name ?? '';
  const t = await getTranslations('tasks');

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-6">
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
        current={{
          clientId,
          assigneeId: filter.assigneeId ?? null,
          status: filter.status,
        }}
      />
      <TaskList
        tasks={tasks}
        today={taskToday(new Date())}
        showClient={false}
        setStatus={setTaskStatusAction}
        setItem={setTaskItemAction}
        edit={{ people: options.people, update: updateTaskAction, remove: deleteTaskAction }}
      />
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'shell.room.tasks');
}
