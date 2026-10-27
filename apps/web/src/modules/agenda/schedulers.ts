const STUDIO_SCHEDULERS: readonly string[] = ['founder', 'project_manager'];

/** Founders and project managers schedule the studio's own meetings; others only read the agenda. */
export function canScheduleInStudio(roles: readonly string[]): boolean {
  return roles.some((role) => STUDIO_SCHEDULERS.includes(role));
}
