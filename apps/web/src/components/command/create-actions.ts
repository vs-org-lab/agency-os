import type { Actor } from '@/modules/access';
import { canCreateTasks } from '@/modules/tasks';
import type { CreateAction } from './command-palette';

/** Create entries offered by the palette; each one is a page entry that already enforces its own permission. */
export function commandCreateActions(actor: Actor): CreateAction[] {
  return canCreateTasks(actor.roles)
    ? [{ labelKey: 'command.create.newTask', href: '/tasks?new=1' }]
    : [];
}
