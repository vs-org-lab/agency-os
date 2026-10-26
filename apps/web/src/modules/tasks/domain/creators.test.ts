import { describe, expect, it } from 'vitest';
import { canCreateTasks } from './creators';

describe('canCreateTasks', () => {
  it.each([['founder'], ['project_manager']])('allows %s', (role) => {
    expect(canCreateTasks([role])).toBe(true);
  });

  it.each([['freelancer'], ['finance']])('refuses %s', (role) => {
    expect(canCreateTasks([role])).toBe(false);
  });

  it('refuses an empty role list', () => {
    expect(canCreateTasks([])).toBe(false);
  });
});
