import { describe, expect, it } from 'vitest';
import { boardColumns, doneSince, dueUrgency, nextStageFields, taskStage } from './board';

const task = (
  title: string,
  fields: {
    status?: 'open' | 'done';
    startedAt?: string | null;
    completedAt?: string | null;
    dueOn?: string | null;
  } = {},
) => ({
  title,
  status: fields.status ?? 'open',
  startedAt: fields.startedAt ?? null,
  completedAt: fields.completedAt ?? null,
  dueOn: fields.dueOn ?? null,
  createdAt: '2026-11-01T09:00:00.000Z',
});

const TODAY = '2026-11-09';

describe('task stage', () => {
  it('reads not started, in progress and done from the status and the start time', () => {
    expect(taskStage(task('a'))).toBe('todo');
    expect(taskStage(task('b', { startedAt: '2026-11-08T10:00:00.000Z' }))).toBe('doing');
    expect(taskStage(task('c', { status: 'done', startedAt: '2026-11-08T10:00:00.000Z' }))).toBe(
      'done',
    );
  });
});

describe('done window', () => {
  it('keeps the 14 calendar days up to today', () => {
    expect(doneSince(TODAY)).toBe('2026-10-27');
  });
});

describe('board columns', () => {
  it('orders open columns by due date with undated last', () => {
    const columns = boardColumns(
      [
        task('undated'),
        task('late', { dueOn: '2026-11-20' }),
        task('soon', { dueOn: '2026-11-10' }),
        task('working', { startedAt: '2026-11-08T10:00:00.000Z', dueOn: '2026-11-12' }),
      ],
      TODAY,
    );
    expect(columns.todo.map((item) => item.title)).toEqual(['soon', 'late', 'undated']);
    expect(columns.doing.map((item) => item.title)).toEqual(['working']);
    expect(columns.done).toEqual([]);
  });

  it('shows tasks done in the window, the most recent first', () => {
    const columns = boardColumns(
      [
        task('old', { status: 'done', completedAt: '2026-10-26T12:00:00.000Z' }),
        task('first', { status: 'done', completedAt: '2026-10-27T09:00:00.000Z' }),
        task('latest', { status: 'done', completedAt: '2026-11-09T08:00:00.000Z' }),
      ],
      TODAY,
    );
    expect(columns.done.map((item) => item.title)).toEqual(['latest', 'first']);
  });

  it('measures the window on the Lisbon calendar', () => {
    // In summer, 23:30 UTC on 1 July is 00:30 on 2 July in Lisbon, the first day of the window.
    const columns = boardColumns(
      [
        task('edge', { status: 'done', completedAt: '2026-07-01T23:30:00.000Z' }),
        task('before', { status: 'done', completedAt: '2026-07-01T22:30:00.000Z' }),
      ],
      '2026-07-15',
    );
    expect(columns.done.map((item) => item.title)).toEqual(['edge']);
  });
});

describe('due urgency', () => {
  it('marks overdue, today and tomorrow, and later dates', () => {
    expect(dueUrgency('2026-11-08', TODAY, 'todo')).toBe('overdue');
    expect(dueUrgency('2026-11-09', TODAY, 'doing')).toBe('soon');
    expect(dueUrgency('2026-11-10', TODAY, 'todo')).toBe('soon');
    expect(dueUrgency('2026-11-11', TODAY, 'todo')).toBe('later');
    expect(dueUrgency(null, TODAY, 'todo')).toBe('none');
  });

  it('never colours a done task', () => {
    expect(dueUrgency('2026-11-01', TODAY, 'done')).toBe('none');
  });

  it('handles the end of a month', () => {
    expect(dueUrgency('2026-12-01', '2026-11-30', 'todo')).toBe('soon');
  });
});

describe('stage fields', () => {
  const now = new Date('2026-11-09T10:00:00.000Z');
  const started = new Date('2026-11-05T10:00:00.000Z');

  it('clears both times when moved back to to do', () => {
    expect(nextStageFields('todo', started, now)).toEqual({
      status: 'open',
      startedAt: null,
      completedAt: null,
    });
  });

  it('keeps the first start time when moved to in progress', () => {
    expect(nextStageFields('doing', started, now)).toEqual({
      status: 'open',
      startedAt: started,
      completedAt: null,
    });
    expect(nextStageFields('doing', null, now)).toEqual({
      status: 'open',
      startedAt: now,
      completedAt: null,
    });
  });

  it('completes now and keeps the start time when moved to done', () => {
    expect(nextStageFields('done', started, now)).toEqual({
      status: 'done',
      startedAt: started,
      completedAt: now,
    });
  });
});
