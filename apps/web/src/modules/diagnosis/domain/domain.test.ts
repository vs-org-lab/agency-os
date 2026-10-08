import { describe, expect, it } from 'vitest';
import type { CoreLevel, RoadmapLane } from '@agency-os/db';
import { DEFAULT_ORBIT_GRID } from '../templates/defaults';
import { addBusinessDays } from './business-days';
import { proposeLane } from './lanes';
import { orbitIndex } from './orbit-index';
import { stageOneGaps, type CoreReadiness } from './readiness';

describe('proposeLane', () => {
  const cases: Array<[CoreLevel, CoreLevel, RoadmapLane]> = [
    ['high', 'low', 'days_30'],
    ['high', 'medium', 'days_90'],
    ['high', 'high', 'days_90'],
    ['medium', 'low', 'months_12'],
    ['medium', 'medium', 'months_12'],
    ['medium', 'high', 'months_12'],
    ['low', 'low', 'months_12'],
    ['low', 'medium', 'months_12'],
    ['low', 'high', 'months_12'],
  ];

  for (const [impact, effort, lane] of cases) {
    it(`${impact} impact with ${effort} effort goes to ${lane}`, () => {
      expect(proposeLane(impact, effort)).toBe(lane);
    });
  }
});

describe('orbitIndex', () => {
  it('totals each front and flags incomplete ones', () => {
    const orbitCriteria = DEFAULT_ORBIT_GRID.fronts.find((front) => front.front === 'orbit');
    if (!orbitCriteria) throw new Error('orbit front missing');
    const scores = [
      ...orbitCriteria.criteria.map((criterion) => ({
        front: 'orbit' as const,
        criterionId: criterion.id,
        points: 3,
      })),
      { front: 'core' as const, criterionId: 'value_proposition', points: 4 },
    ];

    const index = orbitIndex(DEFAULT_ORBIT_GRID, scores);

    expect(index.find((row) => row.front === 'orbit')).toEqual({
      front: 'orbit',
      total: 15,
      max: 25,
      complete: true,
    });
    expect(index.find((row) => row.front === 'core')).toEqual({
      front: 'core',
      total: 4,
      max: 25,
      complete: false,
    });
  });

  it('caps points at the criterion maximum and ignores unknown criteria', () => {
    const index = orbitIndex(DEFAULT_ORBIT_GRID, [
      { front: 'gravity', criterionId: 'forms', points: 9 },
      { front: 'gravity', criterionId: 'unknown', points: 5 },
      { front: 'gravity', criterionId: 'automations', points: -2 },
    ]);

    expect(index.find((row) => row.front === 'gravity')?.total).toBe(5);
  });
});

describe('stageOneGaps', () => {
  const ready: CoreReadiness = {
    briefingHasContent: true,
    frontsScored: true,
    findingsWithoutEvidence: 0,
    internalItems: 2,
    crossReviewed: true,
    presentationAttached: true,
    proposalSessionScheduled: true,
    presentationShared: true,
  };

  it('has no gaps when every criterion is met', () => {
    for (const code of ['1.2', '1.3', '1.4', '1.5', '1.6'] as const) {
      expect(stageOneGaps(code, ready)).toEqual([]);
    }
  });

  it('1.3 requires briefing content', () => {
    expect(stageOneGaps('1.3', { ...ready, briefingHasContent: false })).toEqual([
      'briefing_empty',
    ]);
  });

  it('1.4 lists every quality gap', () => {
    expect(
      stageOneGaps('1.4', {
        ...ready,
        frontsScored: false,
        findingsWithoutEvidence: 2,
        internalItems: 1,
        crossReviewed: false,
      }),
    ).toEqual([
      'fronts_unscored',
      'findings_without_evidence',
      'internal_items_below_minimum',
      'cross_review_missing',
    ]);
  });

  it('1.5 requires the presentation and the proposal session', () => {
    expect(
      stageOneGaps('1.5', {
        ...ready,
        presentationAttached: false,
        proposalSessionScheduled: false,
      }),
    ).toEqual(['presentation_missing', 'proposal_session_missing']);
  });

  it('1.6 requires the presentation shared with the client', () => {
    expect(stageOneGaps('1.6', { ...ready, presentationShared: false })).toEqual([
      'presentation_not_shared',
    ]);
  });

  it('codes outside the criteria table have no gaps', () => {
    expect(stageOneGaps('1.2', { ...ready, briefingHasContent: false })).toEqual([]);
    expect(stageOneGaps('2.1', { ...ready, crossReviewed: false })).toEqual([]);
  });
});

describe('addBusinessDays', () => {
  it('skips the weekend from a Thursday', () => {
    expect(
      addBusinessDays(new Date('2026-10-08T15:00:00Z'), 5, 'Europe/Lisbon').toISOString(),
    ).toBe('2026-10-15T15:00:00.000Z');
  });

  it('counts from the next Monday when starting on a Saturday', () => {
    expect(
      addBusinessDays(new Date('2026-10-10T10:00:00Z'), 5, 'Europe/Lisbon').toISOString(),
    ).toBe('2026-10-16T10:00:00.000Z');
  });

  it('uses the local day of the given time zone', () => {
    expect(
      addBusinessDays(new Date('2026-10-09T23:30:00Z'), 1, 'Europe/Lisbon').toISOString(),
    ).toBe('2026-10-11T23:30:00.000Z');
  });
});
