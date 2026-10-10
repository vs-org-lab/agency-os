export type RoundsStatus = { used: number; limit: number; warning: boolean; extra: boolean };

/** RF-073 and AUT-17: the warning starts at 80% of the limit; a round past the limit is extra. */
export function roundsStatus(used: number, limit: number): RoundsStatus {
  return {
    used,
    limit,
    warning: used >= Math.ceil(0.8 * limit),
    extra: used > limit,
  };
}
