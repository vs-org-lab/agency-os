'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Checkbox } from '@agency-os/ui/components/checkbox';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { SidePanel } from '@agency-os/ui/components/side-panel';
import { MemberSelector } from '@agency-os/ui/components/member-selector';
import { Tabs, TabsList, TabsTrigger } from '@agency-os/ui/components/tabs';
import { Textarea } from '@agency-os/ui/components/textarea';
import { Copy, Trash2 } from 'lucide-react';
import { DateField } from '@/components/forms/date-field';
import { notify } from '@/components/ui/notify';
import type { AttachableFile } from '@/modules/library';
import { canTakeTask, type TaskDetail, type TaskPerson } from '@/modules/tasks';
import { TaskComments } from './task-comments';
import type { TaskActionResult } from './task-errors';
import { TaskFiles, type TaskFileActions } from './task-files';
import { TaskLinks } from './task-links';
import { useTaskAction } from './use-task-action';
import { useTaskParams } from './use-task-params';

export type TaskChanges = {
  taskId: string;
  title?: string;
  notes?: string;
  assigneeId?: string | null;
  dueOn?: string | null;
};

export type TaskPanelActions = TaskFileActions & {
  update: (input: TaskChanges) => Promise<TaskActionResult>;
  remove: (taskId: string) => Promise<TaskActionResult>;
  setItem: (itemId: string, done: boolean) => Promise<TaskActionResult>;
  addItem: (taskId: string, title: string) => Promise<TaskActionResult>;
  addComment: (taskId: string, body: string) => Promise<TaskActionResult>;
  deleteComment: (commentId: string) => Promise<TaskActionResult>;
  addLink: (input: {
    taskId: string;
    url: string;
    title?: string | null;
  }) => Promise<TaskActionResult>;
  removeLink: (linkId: string) => Promise<TaskActionResult>;
};

type PanelProps = {
  /** The task opened by `?task=`; null when none is open or the reader cannot read it. */
  detail: TaskDetail | null;
  people: TaskPerson[];
  /** Ready library files of the task's project that the reader may link. */
  attachable: AttachableFile[];
  actions: TaskPanelActions;
};

const PANEL_ID = 'task-panel-content';
const TAB_ID = { details: 'task-panel-tab-details', collaboration: 'task-panel-tab-collaboration' };

function Checklist({
  task,
  actions,
}: {
  task: TaskDetail;
  actions: Pick<TaskPanelActions, 'setItem' | 'addItem'>;
}) {
  const t = useTranslations('tasks.panel.details');
  const { run, pending } = useTaskAction();
  const [title, setTitle] = useState('');

  const add = async () => {
    const value = title.trim();
    if (!value) return;
    if (await run(() => actions.addItem(task.id, value))) setTitle('');
  };

  return (
    <section aria-labelledby="task-checklist-heading" className="flex flex-col gap-2">
      <h3 id="task-checklist-heading" className="text-label text-text">
        {t('checklist')}
      </h3>
      {task.items.length > 0 ? (
        <ul className="flex flex-col">
          {task.items.map((item) => (
            <li key={item.id} className="flex h-8 items-center gap-2">
              <Checkbox
                id={`panel-item-${item.id}`}
                checked={item.done}
                disabled={pending}
                onCheckedChange={(checked) =>
                  void run(() => actions.setItem(item.id, checked === true))
                }
              />
              <label
                htmlFor={`panel-item-${item.id}`}
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
      <Input
        aria-label={t('itemTitle')}
        placeholder={t('addItem')}
        maxLength={200}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
          event.preventDefault();
          void add();
        }}
      />
    </section>
  );
}

function Details({
  task,
  people,
  actions,
}: {
  task: TaskDetail;
  people: TaskPerson[];
  actions: TaskPanelActions;
}) {
  const t = useTranslations('tasks.panel.details');
  const tf = useTranslations('tasks.form');
  const tInteraction = useTranslations('interaction');
  const { run } = useTaskAction();
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? '');
  const [dueOn, setDueOn] = useState(task.dueOn ?? '');
  const editable = task.canEdit;

  const save = async (changes: Omit<TaskChanges, 'taskId'>) => {
    if (await run(() => actions.update({ taskId: task.id, ...changes }))) {
      notify.success(tf('saved'));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Label htmlFor="task-panel-title">{t('title')}</Label>
        <Input
          id="task-panel-title"
          readOnly={!editable}
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => {
            const next = title.trim();
            if (next === '') setTitle(task.title);
            else if (next !== task.title) void save({ title: next });
          }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="task-panel-notes">{t('notes')}</Label>
        <Textarea
          id="task-panel-notes"
          rows={4}
          readOnly={!editable}
          maxLength={5000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => {
            if (notes.trim() !== task.notes) void save({ notes: notes.trim() });
          }}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="task-panel-assignee">{t('assignee')}</Label>
          <MemberSelector
            id="task-panel-assignee"
            name="assignee"
            label={t('assignee')}
            value={assigneeId || null}
            disabled={!editable}
            onChange={(next) => {
              setAssigneeId(next ?? '');
              void save({ assigneeId: next });
            }}
            members={people
              .filter((person) => canTakeTask(person, task.clientId))
              .map((person) => ({
                id: person.id,
                name: person.name,
                priority:
                  task.clientId !== null && person.clientIds?.includes(task.clientId) === true,
              }))}
            unassignedLabel={tf('none')}
            searchPlaceholder={tInteraction('searchMember')}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="task-panel-due">{t('dueOn')}</Label>
          <DateField
            id="task-panel-due"
            name="dueOn"
            label={t('dueOn')}
            value={dueOn}
            disabled={!editable}
            onValueChange={(next) => {
              setDueOn(next);
              void save({ dueOn: next || null });
            }}
          />
        </div>
      </div>
      <dl className="grid gap-3 text-body-sm sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="text-caption text-text-secondary">{t('client')}</dt>
          <dd className="text-text">{task.clientName ?? tf('studio')}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-caption text-text-secondary">{t('project')}</dt>
          <dd className="text-text">{task.projectName ?? t('none')}</dd>
        </div>
      </dl>
      <Checklist task={task} actions={actions} />
    </div>
  );
}

function PanelContent({
  task,
  open,
  onClose,
  people,
  attachable,
  actions,
}: Omit<PanelProps, 'detail'> & { task: TaskDetail; open: boolean; onClose: () => void }) {
  const t = useTranslations('tasks.panel');
  const { run, pending } = useTaskAction();
  const [tab, setTab] = useState<'details' | 'collaboration'>('details');
  const [confirming, setConfirming] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify.success(t('linkCopied'));
    } catch {
      notify.error(t('copyFailed'));
    }
  };

  const remove = async () => {
    if (await run(() => actions.remove(task.id))) {
      notify.success(t('deleted'));
      onClose();
    }
  };

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={task.title}
      closeLabel={t('close')}
      actions={
        confirming ? (
          <div role="group" aria-label={t('deleteConfirm')} className="flex flex-col gap-2">
            <p className="text-body-sm text-text">{t('deleteConfirm')}</p>
            <p className="text-caption text-text-secondary">{t('deleteHint')}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={remove}
              >
                {t('confirmDelete')}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                {t('cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Button type="button" size="sm" variant="outline" onClick={copyLink}>
              <Copy aria-hidden />
              {t('copyLink')}
            </Button>
            {task.canEdit ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(true)}>
                <Trash2 aria-hidden />
                {t('delete')}
              </Button>
            ) : null}
          </>
        )
      }
      tabs={
        <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
          <TabsList className="w-full">
            <TabsTrigger value="details" id={TAB_ID.details} aria-controls={PANEL_ID}>
              {t('tabs.details')}
            </TabsTrigger>
            <TabsTrigger value="collaboration" id={TAB_ID.collaboration} aria-controls={PANEL_ID}>
              {t('tabs.collaboration', { count: task.commentCount })}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      <div id={PANEL_ID} role="tabpanel" aria-labelledby={TAB_ID[tab]}>
        {tab === 'details' ? (
          <Details task={task} people={people} actions={actions} />
        ) : (
          <TaskFiles task={task} attachable={attachable} actions={actions}>
            <TaskLinks
              taskId={task.id}
              links={task.links}
              addLink={actions.addLink}
              removeLink={actions.removeLink}
            />
            <TaskComments
              taskId={task.id}
              comments={task.comments}
              addComment={actions.addComment}
              deleteComment={actions.deleteComment}
            />
          </TaskFiles>
        )}
      </div>
    </SidePanel>
  );
}

/**
 * The side panel of the task in `?task=`: details, comments, files and links. It is open while
 * the reader can read that task and closing removes the param, keeping the rest of the address.
 */
export function TaskPanel({ detail, ...rest }: PanelProps) {
  const setParams = useTaskParams();
  const [closing, setClosing] = useState(false);
  // Keeps the content on screen while the panel slides out after the param is gone.
  const retained = useRef<TaskDetail | null>(null);
  if (detail) retained.current = detail;

  useEffect(() => {
    if (detail === null) setClosing(false);
  }, [detail]);

  const task = detail ?? retained.current;
  if (!task) return null;

  return (
    <PanelContent
      key={task.id}
      task={task}
      open={detail !== null && !closing}
      onClose={() => {
        setClosing(true);
        setParams({ task: null });
      }}
      {...rest}
    />
  );
}
