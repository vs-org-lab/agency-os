import { describe, expect, it } from 'vitest';
import { sortByUrgency } from './urgency';
import { endOfWeek, startOfWeek } from './week';

describe('week bounds', () => {
  it('a week runs Monday to Sunday', () => {
    expect(startOfWeek('2026-10-14')).toBe('2026-10-12');
    expect(endOfWeek('2026-10-14')).toBe('2026-10-18');
  });

  it('a Sunday ends its own week and a Monday starts its own', () => {
    expect(endOfWeek('2026-10-18')).toBe('2026-10-18');
    expect(startOfWeek('2026-10-18')).toBe('2026-10-12');
    expect(startOfWeek('2026-10-19')).toBe('2026-10-19');
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
