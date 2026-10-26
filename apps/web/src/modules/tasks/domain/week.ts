const DAY_MS = 24 * 60 * 60 * 1000;

/** The Sunday that ends the week of `day` (weeks run Monday to Sunday). */
export function endOfWeek(day: string): string {
  const time = Date.parse(`${day}T00:00:00Z`);
  const weekday = new Date(time).getUTCDay();
  return new Date(time + ((7 - weekday) % 7) * DAY_MS).toISOString().slice(0, 10);
}

/** The Monday that starts the week of the given calendar date. */
export function startOfWeek(day: string): string {
  const time = Date.parse(`${day}T00:00:00Z`);
  const weekday = new Date(time).getUTCDay();
  return new Date(time - ((weekday + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
}
