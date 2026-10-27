export type ContrastLevel = 'AAA' | 'AA' | 'fail';

/** WCAG 2.x thresholds for normal-size text. */
export function contrastLevel(ratio: number): ContrastLevel {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  return 'fail';
}
