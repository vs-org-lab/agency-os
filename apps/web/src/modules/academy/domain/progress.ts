/** How many of a checklist's steps are done. */
export function checklistProgress(
  stepIds: readonly string[],
  checked: ReadonlySet<string>,
): { done: number; total: number } {
  return { done: stepIds.filter((id) => checked.has(id)).length, total: stepIds.length };
}
