import { describe, expect, it } from 'vitest';
import { linkMilestonesToPhases, type LinkableMilestone } from './links';
import { milestoneTriggers } from './plan';

const milestone = (
  position: number,
  trigger: LinkableMilestone['trigger'],
  overrides: Partial<LinkableMilestone> = {},
): LinkableMilestone => ({
  id: `m${position}`,
  position,
  trigger,
  phaseId: null,
  status: 'pending',
  ...overrides,
});

const phase = (position: number, requiresApproval: boolean) => ({
  id: `p${position}`,
  position,
  requiresApproval,
});

describe('milestoneTriggers', () => {
  it('triggers follow the plan size', () => {
    expect(milestoneTriggers(1)).toEqual(['signature']);
    expect(milestoneTriggers(2)).toEqual(['signature', 'delivery']);
    expect(milestoneTriggers(4)).toEqual([
      'signature',
      'phase_approval',
      'phase_approval',
      'delivery',
    ]);
    expect(milestoneTriggers(0)).toEqual([]);
  });
});

describe('linkMilestonesToPhases', () => {
  const phases = [
    phase(1, true),
    phase(2, false),
    phase(3, false),
    phase(4, true),
    phase(5, false),
  ];

  it('middle milestones link to approval phases in order', () => {
    expect(
      linkMilestonesToPhases(
        [
          milestone(1, 'signature'),
          milestone(3, 'phase_approval'),
          milestone(2, 'phase_approval'),
          milestone(4, 'delivery'),
        ],
        phases,
      ),
    ).toEqual([
      { milestoneId: 'm2', phaseId: 'p1' },
      { milestoneId: 'm3', phaseId: 'p4' },
    ]);
  });

  it('extra milestones stay unlinked', () => {
    expect(
      linkMilestonesToPhases(
        [
          milestone(2, 'phase_approval'),
          milestone(3, 'phase_approval'),
          milestone(4, 'phase_approval'),
        ],
        phases,
      ),
    ).toEqual([
      { milestoneId: 'm2', phaseId: 'p1' },
      { milestoneId: 'm3', phaseId: 'p4' },
    ]);
  });

  it('skips milestones already linked or no longer pending, and phases already taken', () => {
    expect(
      linkMilestonesToPhases(
        [
          milestone(2, 'phase_approval', { phaseId: 'p1' }),
          milestone(3, 'phase_approval', { status: 'requested' }),
          milestone(4, 'phase_approval'),
        ],
        phases,
      ),
    ).toEqual([{ milestoneId: 'm4', phaseId: 'p4' }]);
  });
});
