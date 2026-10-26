import { useTranslations } from 'next-intl';
import { FilterBar, type FilterSelect } from '@/components/filters/filter-bar';
import type { TaskCounts } from '@/modules/tasks';
import type { TaskOptionView } from './task-errors';

export const TASK_LIST_ID = 'task-list';

export type TaskFilterValues = {
  clientId: string | null;
  assigneeId: string | null;
  status: 'open' | 'done' | 'all';
};

/** Filters applied through the URL as they change, so filtered lists stay linkable. */
export function TaskFilters({
  clients,
  people,
  current,
  counts,
}: {
  clients: TaskOptionView[] | null;
  people: TaskOptionView[];
  current: TaskFilterValues;
  counts: TaskCounts;
}) {
  const t = useTranslations('tasks.filters');
  const options = (items: TaskOptionView[]) =>
    items.map((item) => ({ value: item.id, label: item.name }));

  const selects: FilterSelect[] = [
    ...(clients
      ? [
          {
            param: 'client',
            label: t('client'),
            options: options(clients),
            value: current.clientId,
            allLabel: t('all'),
          },
        ]
      : []),
    {
      param: 'assignee',
      label: t('assignee'),
      options: options(people),
      value: current.assigneeId,
      allLabel: t('all'),
    },
  ];

  return (
    <FilterBar
      segments={{
        param: 'status',
        value: current.status,
        options: [
          { value: 'open', label: t('open'), count: counts.open },
          { value: 'done', label: t('done'), count: counts.done },
          { value: 'all', label: t('allTasks'), count: counts.all },
        ],
      }}
      selects={selects}
      controls={TASK_LIST_ID}
    />
  );
}
