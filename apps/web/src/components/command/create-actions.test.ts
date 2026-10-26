import { describe, expect, it } from 'vitest';
import type { Actor } from '@/modules/access';
import { commandCreateActions } from './create-actions';

const actorWith = (roles: string[]) => ({ roles }) as unknown as Actor;

describe('commandCreateActions', () => {
  it('offers New task to task creators', () => {
    expect(commandCreateActions(actorWith(['project_manager']))).toEqual([
      { labelKey: 'command.create.newTask', href: '/tasks?new=1' },
    ]);
  });

  it('offers nothing to other roles', () => {
    expect(commandCreateActions(actorWith(['freelancer']))).toEqual([]);
  });
});
