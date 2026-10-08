import type { OrbitFront } from '@agency-os/db';
import { ORBIT_FRONT_MAX_POINTS, type OrbitGrid } from '../templates/definitions';

export type OrbitIndexRow = { front: OrbitFront; total: number; max: 25; complete: boolean };

export type ScoreEntry = { front: OrbitFront; criterionId: string; points: number };

export function orbitIndex(grid: OrbitGrid, scores: ScoreEntry[]): OrbitIndexRow[] {
  return grid.fronts.map((front) => {
    let total = 0;
    let scored = 0;
    for (const criterion of front.criteria) {
      const score = scores.find(
        (entry) => entry.front === front.front && entry.criterionId === criterion.id,
      );
      if (!score) continue;
      scored += 1;
      total += Math.min(Math.max(score.points, 0), criterion.maxPoints);
    }
    return {
      front: front.front,
      total,
      max: ORBIT_FRONT_MAX_POINTS,
      complete: scored === front.criteria.length,
    };
  });
}
