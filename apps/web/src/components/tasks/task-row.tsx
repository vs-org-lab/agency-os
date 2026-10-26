'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { AnimatePresence } from '@agency-os/ui/motion';
import { Checkbox } from '@agency-os/ui/components/checkbox';
import { ClientAvatar } from '@agency-os/ui/components/client-avatar';
import { TableCell, TableRow } from '@agency-os/ui/components/table';
import { cn } from '@agency-os/ui/lib/utils';
import { ChevronRight, MessageSquare } from 'lucide-react';
import type { TaskFilePreview, TaskView } from '@/modules/tasks';
import { SubtaskRows, type SubtaskActions } from './subtask-rows';
import { calendarDate } from './task-date';
import { TaskFilesPreview } from './task-files-preview';
import type { TaskActionResult } from './task-errors';

export type TaskRowActions = SubtaskActions & {
  setStatus: (taskId: string, status: 'open' | 'done') => Promise<TaskActionResult>;
  onOpen: (taskId: string) => void;
  /** Fetches the files shown when the pointer rests on a title; without it there is no preview. */
  loadPreview?: (
    taskId: string,
  ) => Promise<{ ok: true; files: TaskFilePreview[] } | { ok: false; code: string }>;
};

type RowProps = TaskRowActions & {
  task: TaskView;
  today: string;
  showClient: boolean;
};

const isOverdue = (task: TaskView, today: string) =>
  task.status !== 'done' && task.dueOn !== null && task.dueOn < today;

function Due({ task, today }: { task: TaskView; today: string }) {
  const t = useTranslations('tasks');
  const format = useFormatter();
  if (!task.dueOn) return <span className="text-text-secondary">{t('noDate')}</span>;
  return (
    <time
      dateTime={task.dueOn}
      className={isOverdue(task, today) ? 'font-medium text-danger' : undefined}
    >
      {format.dateTime(calendarDate(task.dueOn), { day: 'numeric', month: 'short' })}
    </time>
  );
}

function Assignee({ task }: { task: TaskView }) {
  const t = useTranslations('tasks');
  if (!task.assigneeId || !task.assigneeName) {
    return <span className="text-text-secondary">{t('unassigned')}</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-2">
      <ClientAvatar id={task.assigneeId} name={task.assigneeName} size="sm" tone="neutral" />
      <span className="truncate">{task.assigneeName}</span>
    </span>
  );
}

function CommentCount({ count }: { count: number }) {
  const t = useTranslations('tasks.table');
  if (count === 0) return <span className="text-text-secondary">{t('noValue')}</span>;
  return (
    <span
      className="inline-flex items-center gap-1 text-text-secondary tabular-nums"
      aria-label={t('commentCount', { count })}
    >
      <MessageSquare aria-hidden className="size-3.5" />
      {count}
    </span>
  );
}

function TitleButton({
  task,
  onOpen,
  loadPreview,
}: Pick<TaskRowActions, 'onOpen' | 'loadPreview'> & { task: TaskView }) {
  const button = (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className={cn(
        'min-w-0 truncate rounded-sm text-left text-body-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
        task.status === 'done'
          ? 'text-text-secondary line-through'
          : 'font-medium text-text hover:underline',
      )}
    >
      {task.title}
    </button>
  );
  return loadPreview ? (
    <TaskFilesPreview task={task} loadPreview={loadPreview}>
      {button}
    </TaskFilesPreview>
  ) : (
    button
  );
}

/** One task as a 40 px table row, with its subtasks as an expansion below it. */
export function TaskRow({
  task,
  today,
  showClient,
  expanded,
  onToggle,
  columns,
  ...actions
}: RowProps & { expanded: boolean; onToggle: () => void; columns: number }) {
  const t = useTranslations('tasks');
  const format = useFormatter();
  const done = task.status === 'done';

  return (
    <>
      <TableRow className="h-10">
        <TableCell className="w-10 py-0 pr-0 pl-3">
          <Checkbox
            aria-label={task.title}
            checked={done}
            disabled={actions.pending}
            onCheckedChange={(checked) =>
              void actions.run(() => actions.setStatus(task.id, checked === true ? 'done' : 'open'))
            }
          />
        </TableCell>
        <TableCell className="max-w-72 py-0">
          <span className="flex items-center gap-1">
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={t(expanded ? 'table.collapse' : 'table.expand', { title: task.title })}
              onClick={onToggle}
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-text-secondary outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight
                aria-hidden
                className={cn(
                  'size-4 transition-transform duration-(--duration-base)',
                  expanded && 'rotate-90',
                )}
              />
            </button>
            <TitleButton task={task} onOpen={actions.onOpen} loadPreview={actions.loadPreview} />
          </span>
        </TableCell>
        {showClient ? (
          <TableCell className="py-0 text-body-sm text-text-secondary">
            {task.clientName ?? t('studio')}
          </TableCell>
        ) : null}
        <TableCell className="py-0 text-body-sm text-text-secondary">
          {task.phaseName ?? t('table.noPhase')}
        </TableCell>
        <TableCell className="py-0 text-body-sm text-text">
          <Assignee task={task} />
        </TableCell>
        <TableCell className="py-0 text-body-sm whitespace-nowrap text-text">
          <Due task={task} today={today} />
        </TableCell>
        <TableCell className="py-0 text-body-sm text-text-secondary tabular-nums">
          {task.itemsTotal > 0
            ? t('table.subtaskRatio', { done: task.itemsDone, total: task.itemsTotal })
            : t('table.noValue')}
        </TableCell>
        <TableCell className="py-0 text-body-sm">
          <CommentCount count={task.commentCount} />
        </TableCell>
        <TableCell className="py-0 text-body-sm whitespace-nowrap text-text-secondary">
          {format.dateTime(new Date(task.createdAt), { day: 'numeric', month: 'short' })}
        </TableCell>
      </TableRow>
      <AnimatePresence initial={false}>
        {expanded ? (
          <SubtaskRows
            key="subtasks"
            task={task}
            columns={columns}
            setItem={actions.setItem}
            addItem={actions.addItem}
            run={actions.run}
            pending={actions.pending}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

/** Below 768 px a task is a card: title, due date, assignee and counts. */
export function TaskCard({ task, today, showClient, ...actions }: RowProps) {
  const t = useTranslations('tasks');

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-start gap-3">
        <Checkbox
          className="mt-0.5"
          aria-label={task.title}
          checked={task.status === 'done'}
          disabled={actions.pending}
          onCheckedChange={(checked) =>
            void actions.run(() => actions.setStatus(task.id, checked === true ? 'done' : 'open'))
          }
        />
        <TitleButton task={task} onOpen={actions.onOpen} loadPreview={actions.loadPreview} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-7 text-caption text-text-secondary">
        <Due task={task} today={today} />
        {showClient ? <span>{task.clientName ?? t('studio')}</span> : null}
        <Assignee task={task} />
        {task.itemsTotal > 0 ? (
          <span className="tabular-nums">
            {t('table.subtaskRatio', { done: task.itemsDone, total: task.itemsTotal })}
          </span>
        ) : null}
        {task.commentCount > 0 ? <CommentCount count={task.commentCount} /> : null}
      </div>
    </li>
  );
}
