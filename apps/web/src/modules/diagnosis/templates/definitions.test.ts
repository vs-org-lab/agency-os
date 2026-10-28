import { describe, expect, it } from 'vitest';
import { DEFAULT_BRIEFING_GUIDE, DEFAULT_ORBIT_GRID } from './defaults';
import { briefingGuideSchema, orbitGridSchema } from './definitions';
import { VISUAL_IDENTITY_QUESTION_ID, withSuggestedRequests } from './onboarding-suggestions';

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
  describe('onboarding requests', () => {
    const withoutOnboarding = {
      blocks: DEFAULT_BRIEFING_GUIDE.blocks.map((block) => ({
        ...block,
        questions: block.questions.map(({ id, text }) => ({ id, text })),
      })),
    };

    it('a guide published before onboarding existed still reads, with no requests', () => {
      const parsed = briefingGuideSchema.parse(withoutOnboarding);
      expect(parsed.onboarding).toEqual([]);
    });

    it('an answer condition must name a structured answer and one of its values', () => {
      const request = DEFAULT_BRIEFING_GUIDE.onboarding.find((entry) => entry.id === 'brand_files');
      if (!request) throw new Error('default guide without the brand files request');
      expect(
        briefingGuideSchema.safeParse({ ...withoutOnboarding, onboarding: [request] }).success,
      ).toBe(false);
      expect(
        briefingGuideSchema.safeParse({
          ...DEFAULT_BRIEFING_GUIDE,
          onboarding: [{ ...request, when: { ...request.when, equals: 'maybe' } }],
        }).success,
      ).toBe(false);
    });

    it('rejects repeated request ids', () => {
      const [first] = DEFAULT_BRIEFING_GUIDE.onboarding;
      if (!first) throw new Error('default guide without requests');
      expect(
        briefingGuideSchema.safeParse({ ...DEFAULT_BRIEFING_GUIDE, onboarding: [first, first] })
          .success,
      ).toBe(false);
    });

    it('suggestions complete a guide and fall back to asking everyone without the question', () => {
      const completed = withSuggestedRequests(briefingGuideSchema.parse(withoutOnboarding));
      expect(briefingGuideSchema.safeParse(completed).success).toBe(true);
      expect(completed.onboarding.find((entry) => entry.id === 'brand_files')?.when).toEqual({
        type: 'always',
      });

      const again = withSuggestedRequests(DEFAULT_BRIEFING_GUIDE);
      expect(again.onboarding).toHaveLength(DEFAULT_BRIEFING_GUIDE.onboarding.length);
      expect(again.onboarding.find((entry) => entry.id === 'brand_files')?.when).toEqual({
        type: 'answer',
        questionId: VISUAL_IDENTITY_QUESTION_ID,
        equals: 'yes',
      });
    });
  });
});
