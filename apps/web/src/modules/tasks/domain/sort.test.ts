import { describe, expect, it } from 'vitest';
import { parseTaskSort, sortTasks } from './sort';

const task = (title: string, dueOn: string | null, createdAt: string) => ({
  title,
  dueOn,
  createdAt,
});

const TASKS = [
  task('Beta', null, '2026-10-03T09:00:00.000Z'),
  task('alfa', '2026-10-20', '2026-10-01T09:00:00.000Z'),
  task('Charlie', '2026-10-10', '2026-10-02T09:00:00.000Z'),
];

describe('task sorting', () => {
  it('defaults to the due date for unknown values', () => {
    expect(parseTaskSort(undefined)).toBe('due');
    expect(parseTaskSort('price')).toBe('due');
    expect(parseTaskSort('created')).toBe('created');
    expect(parseTaskSort('title')).toBe('title');
  });

  it('sorts by due date with undated tasks last', () => {
    expect(sortTasks(TASKS, 'due').map((item) => item.title)).toEqual(['Charlie', 'alfa', 'Beta']);
  });

  it('sorts by creation with the newest first', () => {
    expect(sortTasks(TASKS, 'created').map((item) => item.title)).toEqual([
      'Beta',
      'Charlie',
      'alfa',
    ]);
  });

  it('sorts by title ignoring case', () => {
    expect(sortTasks(TASKS, 'title').map((item) => item.title)).toEqual([
      'alfa',
      'Beta',
      'Charlie',
    ]);
  });

  it('does not change the input', () => {
    const input = [...TASKS];
    sortTasks(input, 'title');
    expect(input).toEqual(TASKS);
  });
});
