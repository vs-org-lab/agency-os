import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TaskFilters } from '@/components/tasks/task-filters';
import { TaskForm } from '@/components/tasks/task-form';
import { TaskList } from '@/components/tasks/task-list';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { parseTaskFilter, taskToday } from '@/modules/tasks';
import { loadTaskOptions, loadTasks } from '@/modules/tasks/server';
import {
  createTaskAction,
  deleteTaskAction,
  setTaskItemAction,
  setTaskStatusAction,
  updateTaskAction,
} from '../../../(workspace)/tasks/actions';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; clientId: string }>;
  searchParams: Promise<{ assignee?: string; status?: string }>;
};

export default async function RoomTasksPage({ params, searchParams }: PageProps) {
  const { locale: requested, clientId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const options = await loadTaskOptions(session, clientId);
  if (!options) notFound();
  const filter = parseTaskFilter(await searchParams);
  const tasks = await loadTasks(session, { ...filter, clientId });
  const clientName = options.clients.find((client) => client.id === clientId)?.name ?? '';
  const t = await getTranslations('tasks');

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-caption text-text-secondary">{clientName}</p>
        <h1 className="text-title text-text">{t('title')}</h1>
        <p className="text-body text-text-secondary">{t('roomDescription')}</p>
      </header>
      {options.canCreate ? (
        <details className="rounded-lg border border-border bg-surface px-4 py-3">
          <summary className="cursor-pointer text-body font-medium text-text">
            {t('form.heading')}
          </summary>
          <div className="pt-4">
            <TaskForm
              clients={[]}
              people={options.people}
              fixedClientId={clientId}
              create={createTaskAction}
            />
          </div>
        </details>
      ) : null}
      <TaskFilters
        action={`/c/${clientId}/tasks`}
        clients={null}
        people={options.people}
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
