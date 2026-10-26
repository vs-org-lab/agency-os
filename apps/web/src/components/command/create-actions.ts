import type { Actor } from '@/modules/access';
import type { CreateAction } from './command-palette';

const TASK_CREATOR_ROLES: readonly string[] = ['founder', 'project_manager'];

/** Create entries offered by the palette; each one is a page entry that already enforces its own permission. */
export function commandCreateActions(actor: Actor): CreateAction[] {
  return actor.roles.some((role) => TASK_CREATOR_ROLES.includes(role))
    ? [{ labelKey: 'command.create.newTask', href: '/tasks?new=1' }]
    : [];
}
