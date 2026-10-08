import { describe, expect, it } from 'vitest';
import { DEFAULT_BRIEFING_GUIDE, DEFAULT_ORBIT_GRID } from './defaults';
import { briefingGuideSchema, orbitGridSchema } from './definitions';

describe('Core templates', () => {
  it('default guide and grid satisfy their schemas', () => {
    expect(briefingGuideSchema.safeParse(DEFAULT_BRIEFING_GUIDE).success).toBe(true);
    expect(orbitGridSchema.safeParse(DEFAULT_ORBIT_GRID).success).toBe(true);
    expect(DEFAULT_BRIEFING_GUIDE.blocks).toHaveLength(4);
    expect(DEFAULT_ORBIT_GRID.fronts.map((front) => front.front)).toEqual([
      'core',
      'orbit',
      'gravity',
      'constellation',
    ]);
  });

  it('rejects a grid front that does not sum to 25', () => {
    const [first, ...rest] = DEFAULT_ORBIT_GRID.fronts;
    if (!first) throw new Error('grid without fronts');
    const broken = {
      fronts: [
        {
          ...first,
          criteria: first.criteria.map((criterion, index) =>
            index === 0 ? { ...criterion, maxPoints: 6 } : criterion,
          ),
        },
        ...rest,
      ],
    };

    expect(orbitGridSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a grid that repeats or misses a front', () => {
    const [first, second, third] = DEFAULT_ORBIT_GRID.fronts;
    if (!first || !second || !third) throw new Error('grid without fronts');

    expect(orbitGridSchema.safeParse({ fronts: [first, second, third, first] }).success).toBe(
      false,
    );
  });

  it('rejects duplicate question ids', () => {
    const [first, ...rest] = DEFAULT_BRIEFING_GUIDE.blocks;
    if (!first) throw new Error('guide without blocks');
    const duplicated = first.questions[0];
    if (!duplicated) throw new Error('block without questions');
    const broken = { blocks: [{ ...first, questions: [...first.questions, duplicated] }, ...rest] };

    expect(briefingGuideSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a guide without exactly four blocks', () => {
    expect(
      briefingGuideSchema.safeParse({ blocks: DEFAULT_BRIEFING_GUIDE.blocks.slice(0, 3) }).success,
    ).toBe(false);
  });
});
