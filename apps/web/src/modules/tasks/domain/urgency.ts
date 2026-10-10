/** US-11: what is overdue comes first, then everything by due time. */
export function sortByUrgency<T extends { dueAt: Date; overdue: boolean }>(
  items: readonly T[],
): T[] {
  return [...items].sort((left, right) => {
    if (left.overdue !== right.overdue) return left.overdue ? -1 : 1;
    return left.dueAt.getTime() - right.dueAt.getTime();
  });
}
