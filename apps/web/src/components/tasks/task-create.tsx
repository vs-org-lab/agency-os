'use client';

import { useTranslations } from 'next-intl';
import { CreateSheet } from '@/components/ui/create-sheet';
import { useStripNewParam } from '@/components/ui/use-strip-new-param';
import type { TaskPerson } from '@/modules/tasks';
import type { TaskActionResult, TaskOptionView } from './task-errors';
import { TaskForm, type NewTaskInput } from './task-form';

/** The "Nova tarefa" button and its side panel; absent for readers who cannot create tasks. */
export function TaskCreate({
  canCreate,
  openRequested,
  clients,
  people,
  fixedClientId,
  create,
}: {
  canCreate: boolean;
  /** `?new=1`: opens the panel on arrival, honoured only when the reader may create. */
  openRequested: boolean;
  clients: TaskOptionView[];
  people: TaskPerson[];
  fixedClientId: string | null;
  create: (input: NewTaskInput) => Promise<TaskActionResult>;
}) {
  const t = useTranslations('tasks');
  const stripNewParam = useStripNewParam();
  if (!canCreate) return null;

  return (
    <CreateSheet
      label={t('form.heading')}
      title={t('form.heading')}
      openRequested={openRequested}
      onClose={stripNewParam}
    >
      {(close) => (
        <TaskForm
          clients={clients}
          people={people}
          fixedClientId={fixedClientId}
          create={create}
          onDone={(message) => close({ message })}
        />
      )}
    </CreateSheet>
  );
}
