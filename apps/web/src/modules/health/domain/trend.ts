/** Days back the health trend compares with (spec 3E.1 §3.7). */
export const TREND_WINDOW_DAYS = 30;

/** Today's score against the earlier snapshot, or null without both. */
export function healthTrend(today: number | null, past: number | null): number | null {
  return today === null || past === null ? null : today - past;
}
