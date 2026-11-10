'use client';

import { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@agency-os/ui/lib/utils';
import { Link, usePathname } from '@/i18n/navigation';
import {
  boardColumns,
  TASK_STAGES,
  taskStage,
  type TaskStage,
  type TaskView,
} from '@/modules/tasks';
import type { TaskActionResult } from './task-errors';
import { TaskBoardCard } from './task-board-card';
import { useTaskAction } from './use-task-action';
import { useTaskParams } from './use-task-params';

type TaskBoardProps = {
  tasks: TaskView[];
  /** The organisation's calendar date (YYYY-MM-DD) that urgency and the done window use. */
  today: string;
  showClient: boolean;
  currentUserId: string;
  setStage: (taskId: string, stage: TaskStage) => Promise<TaskActionResult>;
};

const STAGE_BAR: Record<TaskStage, string> = {
  todo: 'bg-text-tertiary',
  doing: 'bg-info',
  done: 'bg-success',
};

/** The stored fields a move leaves, applied before the server confirms it. */
function moved(task: TaskView, stage: TaskStage, now: string): TaskView {
  if (stage === 'todo') return { ...task, status: 'open', startedAt: null, completedAt: null };
  if (stage === 'doing')
    return { ...task, status: 'open', startedAt: task.startedAt ?? now, completedAt: null };
  return { ...task, status: 'done', completedAt: now };
}

function DoneLink() {
  const t = useTranslations('tasks.board');
  const pathname = usePathname();
  const params = new URLSearchParams(useSearchParams().toString());
  for (const param of ['view', 'task', 'sort']) params.delete(param);
  params.set('status', 'done');
  return (
    <Link
      href={`${pathname}?${params.toString()}`}
      className="self-start rounded-sm px-1 text-caption text-text-secondary underline-offset-4 outline-none hover:text-text hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      {t('allDone')}
    </Link>
  );
}

function Column({
  stage,
  children,
  count,
}: {
  stage: TaskStage;
  children: React.ReactNode;
  count: number;
}) {
  const t = useTranslations('tasks.board');
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const headingId = `task-column-${stage}`;

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-lg bg-surface-muted p-2 transition-shadow duration-(--duration-base)',
        isOver && 'ring-2 ring-border-strong',
      )}
    >
      <header className="flex items-center gap-2 px-1 py-1">
        <span aria-hidden className={cn('h-3.5 w-0.5 rounded-full', STAGE_BAR[stage])} />
        <h2 id={headingId} className="text-label text-text">
          {t(`columns.${stage}`)} <span className="text-text-secondary tabular-nums">{count}</span>
        </h2>
        {stage === 'done' ? (
          <span className="ml-auto text-caption text-text-tertiary">{t('doneWindow')}</span>
        ) : null}
      </header>
      {children}
      {stage === 'done' ? <DoneLink /> : null}
    </section>
  );
}

/** S-03 and C-03 as a board: to do, in progress and done, moved by dragging or from a menu. */
export function TaskBoard({ tasks, today, showClient, currentUserId, setStage }: TaskBoardProps) {
  const t = useTranslations('tasks.board');
  const setParams = useTaskParams();
  const { run } = useTaskAction();
  // New props after a navigation or a revalidation replace the local, optimistic copy.
  const [state, setState] = useState({ source: tasks, current: tasks });
  if (state.source !== tasks) setState({ source: tasks, current: tasks });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const replaceTask = (next: TaskView) =>
    setState((current) => ({
      ...current,
      current: current.current.map((entry) => (entry.id === next.id ? next : entry)),
    }));

  const move = (task: TaskView, stage: TaskStage) => {
    replaceTask(moved(task, stage, new Date().toISOString()));
    void run(() => setStage(task.id, stage)).then((ok) => {
      if (!ok) replaceTask(task);
    });
  };

  const titleOf = (id: string | number) =>
    state.current.find((task) => task.id === id)?.title ?? '';
  const columnOf = (id: string | number | undefined) =>
    TASK_STAGES.includes(id as TaskStage) ? t(`columns.${id as TaskStage}`) : '';
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('announce.start', { title: titleOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t('announce.over', { title: titleOf(active.id), column: columnOf(over.id) })
        : t('announce.outside', { title: titleOf(active.id) }),
    onDragEnd: ({ active, over }) =>
      over
        ? t('announce.end', { title: titleOf(active.id), column: columnOf(over.id) })
        : t('announce.cancel', { title: titleOf(active.id) }),
    onDragCancel: ({ active }) => t('announce.cancel', { title: titleOf(active.id) }),
  };

  const onDragEnd = (event: DragEndEvent) => {
    const task = (event.active.data.current as { task?: TaskView } | undefined)?.task;
    const target = event.over?.id as TaskStage | undefined;
    if (!task || !target) return;
    const current = state.current.find((entry) => entry.id === task.id) ?? task;
    if (taskStage(current) !== target) move(current, target);
  };

  const columns = boardColumns(state.current, today);

  return (
    <DndContext
      sensors={sensors}
      onDragEnd={onDragEnd}
      accessibility={{ announcements, screenReaderInstructions: { draggable: t('instructions') } }}
    >
      <div className="grid gap-3 md:grid-cols-3 md:items-start">
        {TASK_STAGES.map((stage) => (
          <Column key={stage} stage={stage} count={columns[stage].length}>
            {columns[stage].length === 0 ? (
              <p className="px-1 py-6 text-center text-caption text-text-secondary">
                {t('emptyColumn')}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {columns[stage].map((task) => (
                  <TaskBoardCard
                    key={task.id}
                    task={task}
                    today={today}
                    showClient={showClient}
                    canMove={task.canEdit || task.assigneeId === currentUserId}
                    onMove={move}
                    onOpen={(taskId) => setParams({ task: taskId })}
                  />
                ))}
              </ul>
            )}
          </Column>
        ))}
      </div>
    </DndContext>
  );
}
