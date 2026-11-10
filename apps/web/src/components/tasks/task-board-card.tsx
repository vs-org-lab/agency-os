'use client';

import { useDraggable } from '@dnd-kit/core';
import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Checkbox } from '@agency-os/ui/components/checkbox';
import { ClientAvatar } from '@agency-os/ui/components/client-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@agency-os/ui/components/dropdown-menu';
import { cn } from '@agency-os/ui/lib/utils';
import {
  ArrowRightLeft,
  CalendarDays,
  GripVertical,
  ListChecks,
  MessageSquare,
} from 'lucide-react';
import {
  dueUrgency,
  TASK_STAGES,
  taskStage,
  type DueUrgency,
  type TaskStage,
  type TaskView,
} from '@/modules/tasks';
import { calendarDate } from './task-date';

const URGENCY_CLASS: Record<DueUrgency, string> = {
  overdue: 'font-medium text-danger',
  soon: 'font-medium text-warning',
  later: 'text-text-secondary',
  none: 'text-text-secondary',
};

const DAY_MS = 24 * 60 * 60 * 1000;
const tomorrowOf = (today: string) =>
  new Date(Date.parse(`${today}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

function Due({ dueOn, today, stage }: { dueOn: string; today: string; stage: TaskStage }) {
  const t = useTranslations('tasks.board');
  const format = useFormatter();
  const label =
    dueOn === today
      ? t('today')
      : dueOn === tomorrowOf(today)
        ? t('tomorrow')
        : format.dateTime(calendarDate(dueOn), { day: 'numeric', month: 'short' });
  return (
    <span className="inline-flex items-center gap-1">
      <CalendarDays aria-hidden className="size-3.5 text-text-tertiary" />
      <time dateTime={dueOn} className={URGENCY_CLASS[dueUrgency(dueOn, today, stage)]}>
        {label}
      </time>
    </span>
  );
}

export type BoardCardProps = {
  task: TaskView;
  today: string;
  showClient: boolean;
  /** Whether the reader may move or complete this task. */
  canMove: boolean;
  onMove: (task: TaskView, stage: TaskStage) => void;
  onOpen: (taskId: string) => void;
};

/** One task on the board: its client, title, due date by urgency and the controls to move it. */
export function TaskBoardCard({
  task,
  today,
  showClient,
  canMove,
  onMove,
  onOpen,
}: BoardCardProps) {
  const t = useTranslations('tasks');
  const stage = taskStage(task);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: !canMove,
  });

  return (
    <li
      ref={setNodeRef}
      style={
        transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
      }
      className={cn(
        'flex flex-col gap-2 rounded-md border border-border bg-surface p-3',
        isDragging && 'relative z-10 shadow-lg',
      )}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          className="mt-0.5"
          aria-label={t(stage === 'done' ? 'table.reopen' : 'table.complete', {
            title: task.title,
          })}
          checked={stage === 'done'}
          disabled={!canMove}
          onCheckedChange={(checked) =>
            onMove(task, checked === true ? 'done' : task.startedAt ? 'doing' : 'todo')
          }
        />
        <button
          type="button"
          onClick={() => onOpen(task.id)}
          className={cn(
            'min-w-0 flex-1 rounded-sm text-left text-body-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
            stage === 'done'
              ? 'text-text-secondary line-through'
              : 'font-medium text-text hover:underline',
          )}
        >
          {task.title}
        </button>
        {task.assigneeId && task.assigneeName ? (
          <ClientAvatar id={task.assigneeId} name={task.assigneeName} size="sm" tone="neutral" />
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-caption text-text-secondary">
        {showClient ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            {task.clientId && task.clientName ? (
              <ClientAvatar
                id={task.clientId}
                name={task.clientName}
                size="sm"
                className="size-5 text-[9px]"
              />
            ) : null}
            <span className="truncate">{task.clientName ?? t('studio')}</span>
          </span>
        ) : null}
        {task.dueOn ? <Due dueOn={task.dueOn} today={today} stage={stage} /> : null}
        {task.itemsTotal > 0 ? (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <ListChecks aria-hidden className="size-3.5 text-text-tertiary" />
            {t('table.subtaskRatio', { done: task.itemsDone, total: task.itemsTotal })}
          </span>
        ) : null}
        {task.commentCount > 0 ? (
          <span
            className="inline-flex items-center gap-1 tabular-nums"
            aria-label={t('table.commentCount', { count: task.commentCount })}
          >
            <MessageSquare aria-hidden className="size-3.5 text-text-tertiary" />
            {task.commentCount}
          </span>
        ) : null}
        {canMove ? (
          <span className="ml-auto flex items-center gap-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t('board.move', { title: task.title })}
                >
                  <ArrowRightLeft aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t('board.moveTo')}</DropdownMenuLabel>
                {TASK_STAGES.filter((option) => option !== stage).map((option) => (
                  <DropdownMenuItem key={option} onSelect={() => onMove(task, option)}>
                    {t(`board.columns.${option}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              aria-label={t('board.drag', { title: task.title })}
              className="flex size-6 cursor-grab items-center justify-center rounded-sm text-text-tertiary outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
              {...listeners}
              {...attributes}
            >
              <GripVertical aria-hidden className="size-4" />
            </button>
          </span>
        ) : null}
      </div>
    </li>
  );
}
