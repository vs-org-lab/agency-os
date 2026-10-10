import { describe, expect, it } from 'vitest';
import { weeklyLoad } from './load';

describe('weeklyLoad', () => {
  it('counts tasks from monday to sunday', () => {
    expect(
      weeklyLoad({
        taskDueDates: ['2026-10-12', '2026-10-14', '2026-10-18', '2026-10-11', '2026-10-19'],
        activeProjects: 2,
        today: '2026-10-14',
      }),
    ).toEqual({ tasksThisWeek: 3, activeProjects: 2 });
  });

  it('undated and later tasks do not count', () => {
    expect(
      weeklyLoad({ taskDueDates: [null, '2026-11-02'], activeProjects: 0, today: '2026-10-12' }),
    ).toEqual({ tasksThisWeek: 0, activeProjects: 0 });
  });
});
