import type { Signal } from './signals';

export type HealthLevel = 'healthy' | 'attention' | 'at_risk';

/** RF-160: the rounded mean of the signals with data, with its level; none gives no score. */
export function healthScore(signals: readonly (Signal | null)[]): {
  score: number | null;
  level: HealthLevel | null;
} {
  const present = signals.filter((signal): signal is Signal => signal !== null);
  if (present.length === 0) return { score: null, level: null };
  const score = Math.round(
    present.reduce((total, signal) => total + signal.score, 0) / present.length,
  );
  const level: HealthLevel = score >= 75 ? 'healthy' : score >= 50 ? 'attention' : 'at_risk';
  return { score, level };
}
