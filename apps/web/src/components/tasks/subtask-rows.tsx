'use client';

import { useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Checkbox } from '@agency-os/ui/components/checkbox';
import { Input } from '@agency-os/ui/components/input';
import { TableCell, TableRow } from '@agency-os/ui/components/table';
import { m, transitions, useReducedMotion } from '@agency-os/ui/motion';
import { Plus } from 'lucide-react';
import type { TaskView } from '@/modules/tasks';
import type { TaskActionResult } from './task-errors';

export type SubtaskActions = {
  setItem: (itemId: string, done: boolean) => Promise<TaskActionResult>;
  addItem: (taskId: string, title: string) => Promise<TaskActionResult>;
  run: (action: () => Promise<TaskActionResult>) => Promise<boolean>;
  pending: boolean;
};

function AddSubtask({
  task,
  addItem,
  run,
}: {
  task: TaskView;
  addItem: SubtaskActions['addItem'];
  run: SubtaskActions['run'];
}) {
  const t = useTranslations('tasks.table');
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [sending, setSending] = useState(false);

  const close = () => {
    setAdding(false);
    setTitle('');
  };

  const submit = async () => {
    const value = title.trim();
    if (!value || sending) return;
    setSending(true);
    const saved = await run(() => addItem(task.id, value));
    setSending(false);
    if (saved) setTitle('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      void submit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  if (!adding) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start text-text-secondary"
        onClick={() => setAdding(true)}
      >
        <Plus aria-hidden />
        {t('addSubtask')}
      </Button>
    );
  }

  return (
    <Input
      autoFocus
      aria-label={t('subtaskTitle')}
      placeholder={t('subtaskPlaceholder')}
      maxLength={200}
      value={title}
      disabled={sending}
      className="h-8 max-w-96"
      onChange={(event) => setTitle(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => {
        if (!title.trim()) close();
      }}
    />
  );
}

/** The checklist of a task as an expansion of its row, with an inline field to add one more. */
export function SubtaskRows({
  task,
  columns,
  setItem,
  addItem,
  run,
  pending,
}: SubtaskActions & { task: TaskView; columns: number }) {
  const t = useTranslations('tasks.table');
  const reducedMotion = useReducedMotion();

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={columns} className="p-0">
        <m.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={reducedMotion ? { duration: 0 } : transitions.base}
          className="overflow-hidden"
        >
          <div className="flex flex-col gap-1 bg-surface-muted py-2 pr-4 pl-18">
            {task.items.length > 0 ? (
              <ul aria-label={t('subtasksOf', { title: task.title })} className="flex flex-col">
                {task.items.map((item) => (
                  <li key={item.id} className="flex h-8 items-center gap-2">
                    <Checkbox
                      id={`task-item-${item.id}`}
                      aria-label={item.title}
                      checked={item.done}
                      disabled={pending}
                      onCheckedChange={(checked) =>
                        void run(() => setItem(item.id, checked === true))
                      }
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
            <AddSubtask task={task} addItem={addItem} run={run} />
          </div>
        </m.div>
      </TableCell>
    </TableRow>
  );
}
