import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Label } from '@agency-os/ui/components/label';
import { TASK_FIELD, type TaskOptionView } from './task-errors';

export type TaskFilterValues = {
  clientId: string | null;
  assigneeId: string | null;
  status: 'open' | 'done';
};

/** A plain GET form so filtered lists are linkable and work without JavaScript. */
export function TaskFilters({
  action,
  clients,
  people,
  current,
}: {
  action: string;
  clients: TaskOptionView[] | null;
  people: TaskOptionView[];
  current: TaskFilterValues;
}) {
  const t = useTranslations('tasks.filters');

  return (
    <form
      method="get"
      action={action}
      aria-label={t('label')}
      className="flex flex-wrap items-end gap-3"
    >
      {clients ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="task-filter-client">{t('client')}</Label>
          <select
            id="task-filter-client"
            name="client"
            defaultValue={current.clientId ?? ''}
            className={TASK_FIELD}
          >
            <option value="">{t('all')}</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <Label htmlFor="task-filter-assignee">{t('assignee')}</Label>
        <select
          id="task-filter-assignee"
          name="assignee"
          defaultValue={current.assigneeId ?? ''}
          className={TASK_FIELD}
        >
          <option value="">{t('all')}</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="task-filter-status">{t('status')}</Label>
        <select
          id="task-filter-status"
          name="status"
          defaultValue={current.status}
          className={TASK_FIELD}
        >
          <option value="open">{t('open')}</option>
          <option value="done">{t('done')}</option>
        </select>
      </div>
      <Button type="submit" variant="outline">
        {t('submit')}
      </Button>
    </form>
  );
}
