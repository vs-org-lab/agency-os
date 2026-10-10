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
  setTaskItemAction,
  setTaskStatusAction,
  updateTaskAction,
} from './actions';

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
  const tasks = await loadTasks(session, filter);
  const t = await getTranslations('tasks');

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-title text-text">{t('title')}</h1>
        <p className="text-body text-text-secondary">{t('description')}</p>
      </header>
      {options.canCreate ? (
        <details
          open={query.new === '1'}
          className="rounded-lg border border-border bg-surface px-4 py-3"
        >
          <summary className="cursor-pointer text-body font-medium text-text">
            {t('form.heading')}
          </summary>
          <div className="pt-4">
            <TaskForm
              clients={options.clients}
              people={options.people}
              fixedClientId={null}
              create={createTaskAction}
            />
          </div>
        </details>
      ) : null}
      <TaskFilters
        action="/tasks"
        clients={options.clients}
        people={options.people}
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
        edit={options.canCreate ? { people: options.people, update: updateTaskAction } : undefined}
      />
    </div>
  );
}
