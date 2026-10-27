import type { ClientHealthView } from '@/modules/health';

/** Whether the score or any of the four signals has data worth showing. */
export function hasHealthData(health: ClientHealthView): boolean {
  return health.score !== null || Object.values(health.signals).some((signal) => signal !== null);
}
