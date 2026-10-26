import { describe, expect, it } from 'vitest';
import { parseTaskFilter, taskToday } from './filter';

const CLIENT = '0b5e7f10-1c1a-4a8e-9a55-2f6a0b1c2d3e';

describe('task filter', () => {
  it('keeps valid ids and defaults to open tasks', () => {
    expect(parseTaskFilter({ client: CLIENT })).toEqual({
      clientId: CLIENT,
      assigneeId: undefined,
      status: 'open',
    });
  });

  it('drops malformed ids and unknown statuses', () => {
    expect(parseTaskFilter({ client: "x' or 1=1", assignee: '', status: 'archived' })).toEqual({
      clientId: undefined,
      assigneeId: undefined,
      status: 'open',
    });
    expect(parseTaskFilter({ status: 'done' }).status).toBe('done');
    expect(parseTaskFilter({ status: 'all' }).status).toBe('all');
  });

  it('measures today in Lisbon', () => {
    expect(taskToday(new Date('2026-10-12T23:30:00Z'))).toBe('2026-10-13');
    expect(taskToday(new Date('2026-12-31T23:30:00Z'))).toBe('2026-12-31');
  });
});
