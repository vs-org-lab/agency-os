import { z } from 'zod';

export type TaskFilter = {
  clientId?: string;
  assigneeId?: string;
  status: 'open' | 'done' | 'all';
};

const LISBON_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' });

/** The calendar date task due dates are measured against; the week runs Monday to Sunday in Lisbon. */
export function taskToday(now: Date): string {
  return LISBON_DATE.format(now);
}

/** Search params to a list filter; malformed ids are dropped rather than reaching the query. */
export function parseTaskFilter(params: {
  client?: string;
  assignee?: string;
  status?: string;
}): TaskFilter {
  const uuid = (value: string | undefined) =>
    value && z.uuid().safeParse(value).success ? value : undefined;
  return {
    clientId: uuid(params.client),
    assigneeId: uuid(params.assignee),
    status: params.status === 'done' || params.status === 'all' ? params.status : 'open',
  };
}
