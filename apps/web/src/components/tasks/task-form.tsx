'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import { canTakeTask, type TaskPerson, type TaskView } from '@/modules/tasks';
import {
  TASK_FIELD,
  taskError,
  type TaskActionResult,
  type TaskError,
  type TaskOptionView,
} from './task-errors';

export type NewTaskInput = {
  title: string;
  notes: string;
  clientId: string | null;
  assigneeId: string | null;
  dueOn: string | null;
  items: string[];
};

export type TaskChanges = {
  taskId: string;
  title: string;
  notes: string;
  assigneeId: string | null;
  dueOn: string | null;
};

type Outcome = { ok: true } | { ok: false; error: TaskError } | null;

function useOutcome() {
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<TaskActionResult>, onSuccess?: () => void) =>
    startTransition(async () => {
      const result = await action().catch(() => ({ ok: false, code: 'not_found' }) as const);
      if (result.ok) onSuccess?.();
      setOutcome(result.ok ? { ok: true } : { ok: false, error: taskError(result.code) });
    });
  return { outcome, setOutcome, pending, run };
}

function PersonSelect({
  id,
  people,
  value,
  onChange,
}: {
  id: string;
  people: TaskPerson[];
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations('tasks.form');
  return (
    <select
      id={id}
      className={TASK_FIELD}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{t('none')}</option>
      {people.map((person) => (
        <option key={person.id} value={person.id}>
          {person.name}
        </option>
      ))}
    </select>
  );
}

/** "Nova tarefa": in a room the client is fixed; in the studio it is optional. */
export function TaskForm({
  clients,
  people,
  fixedClientId,
  create,
  onDone,
}: {
  clients: TaskOptionView[];
  people: TaskPerson[];
  fixedClientId: string | null;
  create: (input: NewTaskInput) => Promise<TaskActionResult>;
  /** Called once with the success message when the task has been created. */
  onDone?: (message: string) => void;
}) {
  const t = useTranslations('tasks');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [clientId, setClientId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [items, setItems] = useState('');
  const { outcome, setOutcome, pending, run } = useOutcome();
  const targetClientId = fixedClientId ?? (clientId || null);
  const eligible = people.filter((person) => canTakeTask(person, targetClientId));

  const reset = () => {
    setTitle('');
    setNotes('');
    setAssigneeId('');
    setDueOn('');
    setItems('');
    onDone?.(t('form.created'));
  };

  return (
    <form
      aria-label={t('form.heading')}
      className="grid gap-3 md:grid-cols-2"
      onChange={() => setOutcome(null)}
      onSubmit={(event) => {
        event.preventDefault();
        run(
          () =>
            create({
              title,
              notes,
              clientId: fixedClientId ?? (clientId || null),
              assigneeId: assigneeId || null,
              dueOn: dueOn || null,
              items: items
                .split('\n')
                .map((item) => item.trim())
                .filter((item) => item.length > 0),
            }),
          reset,
        );
      }}
    >
      <div className="flex flex-col gap-1 md:col-span-2">
        <Label htmlFor="task-title">{t('form.title')}</Label>
        <Input
          id="task-title"
          required
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      {fixedClientId ? null : (
        <div className="flex flex-col gap-1">
          <Label htmlFor="task-client">{t('form.client')}</Label>
          <select
            id="task-client"
            className={TASK_FIELD}
            value={clientId}
            onChange={(event) => {
              const next = event.target.value;
              setClientId(next);
              const current = people.find((person) => person.id === assigneeId);
              if (current && !canTakeTask(current, next || null)) setAssigneeId('');
            }}
          >
            <option value="">{t('form.studio')}</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <Label htmlFor="task-assignee">{t('form.assignee')}</Label>
        <PersonSelect
          id="task-assignee"
          people={eligible}
          value={assigneeId}
          onChange={setAssigneeId}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="task-due">{t('form.dueOn')}</Label>
        <Input
          id="task-due"
          type="date"
          value={dueOn}
          onChange={(event) => setDueOn(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1 md:col-span-2">
        <Label htmlFor="task-notes">{t('form.notes')}</Label>
        <Textarea
          id="task-notes"
          rows={2}
          maxLength={5000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1 md:col-span-2">
        <Label htmlFor="task-items">{t('form.items')}</Label>
        <Textarea
          id="task-items"
          rows={3}
          aria-describedby="task-items-hint"
          value={items}
          onChange={(event) => setItems(event.target.value)}
        />
        <p id="task-items-hint" className="text-caption text-text-secondary">
          {t('form.itemsHint')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <Button type="submit" disabled={pending}>
          {t('form.submit')}
        </Button>
        {outcome?.ok === false ? (
          <FormMessage tone="danger">{t(`errors.${outcome.error}`)}</FormMessage>
        ) : null}
        {outcome?.ok && !onDone ? (
          <FormMessage tone="success">{t('form.created')}</FormMessage>
        ) : null}
      </div>
    </form>
  );
}

/** Title, notes, assignee and date of an existing task; client and subtasks stay as created. */
export function TaskEditForm({
  task,
  people,
  update,
  onDone,
}: {
  task: TaskView;
  people: TaskPerson[];
  update: (input: TaskChanges) => Promise<TaskActionResult>;
  /** Called once with the success message when the changes have been saved. */
  onDone?: (message: string) => void;
}) {
  const t = useTranslations('tasks');
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? '');
  const [dueOn, setDueOn] = useState(task.dueOn ?? '');
  const { outcome, setOutcome, pending, run } = useOutcome();
  const prefix = `task-${task.id}`;

  return (
    <form
      className="grid gap-3 md:grid-cols-2"
      onChange={() => setOutcome(null)}
      onSubmit={(event) => {
        event.preventDefault();
        run(
          () =>
            update({
              taskId: task.id,
              title,
              notes,
              assigneeId: assigneeId || null,
              dueOn: dueOn || null,
            }),
          () => onDone?.(t('form.saved')),
        );
      }}
    >
      <div className="flex flex-col gap-1 md:col-span-2">
        <Label htmlFor={`${prefix}-title`}>{t('form.title')}</Label>
        <Input
          id={`${prefix}-title`}
          required
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${prefix}-assignee`}>{t('form.assignee')}</Label>
        <PersonSelect
          id={`${prefix}-assignee`}
          people={people.filter((person) => canTakeTask(person, task.clientId))}
          value={assigneeId}
          onChange={setAssigneeId}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${prefix}-due`}>{t('form.dueOn')}</Label>
        <Input
          id={`${prefix}-due`}
          type="date"
          value={dueOn}
          onChange={(event) => setDueOn(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1 md:col-span-2">
        <Label htmlFor={`${prefix}-notes`}>{t('form.notes')}</Label>
        <Textarea
          id={`${prefix}-notes`}
          rows={2}
          maxLength={5000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {t('form.save')}
        </Button>
        {outcome?.ok === false ? (
          <FormMessage tone="danger">{t(`errors.${outcome.error}`)}</FormMessage>
        ) : null}
        {outcome?.ok && !onDone ? (
          <FormMessage tone="success">{t('form.saved')}</FormMessage>
        ) : null}
      </div>
    </form>
  );
}
