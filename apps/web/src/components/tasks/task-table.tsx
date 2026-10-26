'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@agency-os/ui/components/table';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { TaskFilePreview, TaskSort, TaskView } from '@/modules/tasks';
import type { TaskActionResult } from './task-errors';
import { TaskCard, TaskRow } from './task-row';
import { useTaskAction } from './use-task-action';
import { useTaskParams } from './use-task-params';

type TaskTableProps = {
  /** Already ordered by `sort`. */
  tasks: TaskView[];
  /** The organisation's calendar date (YYYY-MM-DD) that overdue is measured against. */
  today: string;
  showClient: boolean;
  sort: TaskSort;
  setStatus: (taskId: string, status: 'open' | 'done') => Promise<TaskActionResult>;
  setItem: (itemId: string, done: boolean) => Promise<TaskActionResult>;
  addItem: (taskId: string, title: string) => Promise<TaskActionResult>;
  loadPreview?: (
    taskId: string,
  ) => Promise<{ ok: true; files: TaskFilePreview[] } | { ok: false; code: string }>;
};

const SORT_DIRECTION: Record<TaskSort, 'ascending' | 'descending'> = {
  due: 'ascending',
  title: 'ascending',
  created: 'descending',
};

function SortHeader({
  column,
  label,
  sort,
  onSort,
}: {
  column: TaskSort;
  label: string;
  sort: TaskSort;
  onSort: (column: TaskSort) => void;
}) {
  const active = sort === column;
  const Arrow = SORT_DIRECTION[column] === 'ascending' ? ArrowUp : ArrowDown;

  return (
    <TableHead aria-sort={active ? SORT_DIRECTION[column] : undefined}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 rounded-sm outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
        {active ? <Arrow aria-hidden className="size-3.5" /> : null}
      </button>
    </TableHead>
  );
}

/** S-03 and C-03: tasks as a sortable table with inline subtasks; cards below 768 px. */
export function TaskTable({ tasks, sort, ...rest }: TaskTableProps) {
  const t = useTranslations('tasks');
  const setParams = useTaskParams();
  const { run, pending } = useTaskAction();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  if (tasks.length === 0) {
    return <EmptyState title={t('empty.title')} description={t('empty.description')} />;
  }

  const actions = {
    setStatus: rest.setStatus,
    setItem: rest.setItem,
    addItem: rest.addItem,
    loadPreview: rest.loadPreview,
    run,
    pending,
    onOpen: (taskId: string) => setParams({ task: taskId }),
  };
  const toggle = (taskId: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(taskId)) next.add(taskId);
      return next;
    });

  const columns = rest.showClient ? 9 : 8;
  const onSort = (column: TaskSort) => setParams({ sort: column === 'due' ? null : column });

  // Both layouts are rendered and switched by CSS, so the server markup matches every viewport;
  // the hidden one is display: none and leaves the accessibility tree.
  return (
    <>
      <ul aria-label={t('table.label')} className="flex flex-col gap-2 md:hidden">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            today={rest.today}
            showClient={rest.showClient}
            {...actions}
          />
        ))}
      </ul>
      <div className="hidden rounded-lg border border-border bg-surface md:block">
        <Table aria-label={t('table.label')}>
          <TableHeader>
            <TableRow className="text-caption text-text-secondary">
              <TableHead className="w-10">
                <span className="sr-only">{t('table.columns.done')}</span>
              </TableHead>
              <SortHeader
                column="title"
                label={t('table.columns.title')}
                sort={sort}
                onSort={onSort}
              />
              {rest.showClient ? <TableHead>{t('table.columns.client')}</TableHead> : null}
              <TableHead>{t('table.columns.phase')}</TableHead>
              <TableHead>{t('table.columns.assignee')}</TableHead>
              <SortHeader column="due" label={t('table.columns.due')} sort={sort} onSort={onSort} />
              <TableHead>{t('table.columns.subtasks')}</TableHead>
              <TableHead>{t('table.columns.comments')}</TableHead>
              <SortHeader
                column="created"
                label={t('table.columns.created')}
                sort={sort}
                onSort={onSort}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                today={rest.today}
                showClient={rest.showClient}
                columns={columns}
                expanded={expanded.has(task.id)}
                onToggle={() => toggle(task.id)}
                {...actions}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
