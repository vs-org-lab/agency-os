import { describe, expect, it } from 'vitest';
import { taskGroup } from './groups';
import { sortByUrgency } from './urgency';

describe('taskGroup', () => {
  const today = '2026-10-14';

  it('overdue tasks are today', () => {
    expect(taskGroup('2026-10-10', today)).toBe('today');
    expect(taskGroup('2026-10-14', today)).toBe('today');
  });

  it('sunday ends the week', () => {
    expect(taskGroup('2026-10-15', today)).toBe('this_week');
    expect(taskGroup('2026-10-18', today)).toBe('this_week');
    expect(taskGroup('2026-10-19', today)).toBe('later');
  });

  it('on a sunday only that day is this week', () => {
    expect(taskGroup('2026-10-19', '2026-10-18')).toBe('later');
  });

  it('undated tasks are later', () => {
    expect(taskGroup(null, today)).toBe('later');
  });
});

describe('sortByUrgency', () => {
  it('overdue items come first, then by date', () => {
    const items = [
      { id: 'today-late', dueAt: new Date('2026-10-14T16:00:00Z'), overdue: false },
      { id: 'old', dueAt: new Date('2026-10-01T09:00:00Z'), overdue: true },
      { id: 'today-early', dueAt: new Date('2026-10-14T08:00:00Z'), overdue: false },
      { id: 'recent', dueAt: new Date('2026-10-12T09:00:00Z'), overdue: true },
    ];

    expect(sortByUrgency(items).map((item) => item.id)).toEqual([
      'old',
      'recent',
      'today-early',
      'today-late',
    ]);
  });
});
