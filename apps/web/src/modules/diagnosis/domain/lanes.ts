import type { CoreLevel, RoadmapLane } from '@agency-os/db';

export function proposeLane(impact: CoreLevel, effort: CoreLevel): RoadmapLane {
  if (impact !== 'high') return 'months_12';
  return effort === 'low' ? 'days_30' : 'days_90';
}
