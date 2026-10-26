'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { CreateSheet } from '@/components/ui/create-sheet';
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (!canCreate) return null;

  const stripNewParam = () => {
    if (!searchParams.has('new')) return;
    const rest = new URLSearchParams(searchParams);
    rest.delete('new');
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

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
