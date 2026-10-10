'use client';

import { useState, useTransition } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Checkbox } from '@agency-os/ui/components/checkbox';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { FormMessage } from '@/components/forms/form-message';
import { taskGroup, type TaskGroup, type TaskView } from '@/modules/tasks';
import {
  taskError,
  type TaskActionResult,
  type TaskError,
  type TaskOptionView,
} from './task-errors';
import { TaskEditForm, type TaskChanges } from './task-form';

type ListGroup = TaskGroup | 'done';

const GROUP_ORDER: ListGroup[] = ['today', 'this_week', 'later', 'done'];

type TaskListProps = {
  tasks: TaskView[];
  /** The organisation's calendar date (YYYY-MM-DD) that "Hoje" is measured against. */
  today: string;
  showClient: boolean;
  setStatus: (taskId: string, status: 'open' | 'done') => Promise<TaskActionResult>;
  setItem: (itemId: string, done: boolean) => Promise<TaskActionResult>;
  edit?: {
    people: TaskOptionView[];
    update: (input: TaskChanges) => Promise<TaskActionResult>;
  };
};

function calendarDate(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}

function TaskRow({
  task,
  today,
  showClient,
  setStatus,
  setItem,
  edit,
}: Omit<TaskListProps, 'tasks'> & { task: TaskView }) {
  const t = useTranslations('tasks');
  const format = useFormatter();
  const [error, setError] = useState<TaskError | null>(null);
  const [pending, startTransition] = useTransition();
  const done = task.status === 'done';
  const overdue = !done && task.dueOn !== null && task.dueOn < today;

  const run = (action: () => Promise<TaskActionResult>) =>
    startTransition(async () => {
      const result = await action().catch(() => ({ ok: false, code: 'not_found' }) as const);
      setError(result.ok ? null : taskError(result.code));
    });

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-start gap-3">
        <Checkbox
          className="mt-1"
          aria-label={task.title}
          checked={done}
          disabled={pending}
          onCheckedChange={(checked) =>
            run(() => setStatus(task.id, checked === true ? 'done' : 'open'))
          }
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            className={
              done
                ? 'text-body text-text-secondary line-through'
                : 'text-body font-medium text-text'
            }
          >
            {task.title}
          </span>
          <span className="flex flex-wrap gap-x-3 gap-y-1 text-caption text-text-secondary">
            <span>
              {task.dueOn
                ? format.dateTime(calendarDate(task.dueOn), { day: 'numeric', month: 'short' })
                : t('noDate')}
            </span>
            {showClient ? <span>{task.clientName ?? t('studio')}</span> : null}
            <span>{task.assigneeName ?? t('unassigned')}</span>
          </span>
          {task.notes ? (
            <p className="text-body-sm whitespace-pre-line text-text-secondary">{task.notes}</p>
          ) : null}
        </div>
        {overdue ? (
          <Badge variant="secondary" className="bg-danger-bg text-danger">
            {t('overdue')}
          </Badge>
        ) : null}
      </div>
      {task.items.length > 0 ? (
        <ul
          aria-label={t('itemsLabel', { title: task.title })}
          className="flex flex-col gap-1 pl-7"
        >
          {task.items.map((item) => (
            <li key={item.id} className="flex items-center gap-2">
              <Checkbox
                id={`task-item-${item.id}`}
                aria-label={item.title}
                checked={item.done}
                disabled={pending}
                onCheckedChange={(checked) => run(() => setItem(item.id, checked === true))}
              />
              <label
                htmlFor={`task-item-${item.id}`}
                className={
                  item.done
                    ? 'text-body-sm text-text-secondary line-through'
                    : 'text-body-sm text-text'
                }
              >
                {item.title}
              </label>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <FormMessage tone="danger">{t(`errors.${error}`)}</FormMessage> : null}
      {edit && !done ? (
        <details className="pl-7">
          <summary className="cursor-pointer text-body-sm text-link">{t('edit')}</summary>
          <div className="pt-3">
            <TaskEditForm task={task} people={edit.people} update={edit.update} />
          </div>
        </details>
      ) : null}
    </li>
  );
}

/** S-03 and C-03: open tasks grouped by Hoje, Esta semana and Mais tarde; done tasks last. */
export function TaskList({ tasks, ...rest }: TaskListProps) {
  const t = useTranslations('tasks');

  if (tasks.length === 0) {
    return <EmptyState title={t('empty.title')} description={t('empty.description')} />;
  }

  const groups = new Map<ListGroup, TaskView[]>();
  for (const task of tasks) {
    const group: ListGroup = task.status === 'done' ? 'done' : taskGroup(task.dueOn, rest.today);
    groups.set(group, [...(groups.get(group) ?? []), task]);
  }

  return (
    <div className="flex flex-col gap-6">
      {GROUP_ORDER.filter((group) => groups.has(group)).map((group) => (
        <section
          key={group}
          aria-labelledby={`tasks-group-${group}`}
          className="flex flex-col gap-2"
        >
          <h2 id={`tasks-group-${group}`} className="text-heading text-text">
            {t(`groups.${group}`)}
          </h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {(groups.get(group) ?? []).map((task) => (
              <TaskRow key={task.id} task={task} {...rest} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
