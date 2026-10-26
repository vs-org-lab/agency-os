const CREATOR_ROLES: readonly string[] = ['founder', 'project_manager'];

/** Founders and project managers create tasks; everyone else only completes their own. */
export function canCreateTasks(roles: readonly string[]): boolean {
  return roles.some((role) => CREATOR_ROLES.includes(role));
}
