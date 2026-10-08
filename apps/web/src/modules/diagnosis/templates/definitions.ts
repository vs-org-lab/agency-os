import { z } from 'zod';
import type { OrbitFront } from '@agency-os/db';

export const ORBIT_FRONTS: readonly OrbitFront[] = ['core', 'orbit', 'gravity', 'constellation'];
export const ORBIT_FRONT_MAX_POINTS = 25;
export const BRIEFING_BLOCK_COUNT = 4;

const localizedText = z.object({
  'pt-PT': z.string().trim().min(1).max(500),
  en: z.string().trim().min(1).max(500),
});

export type Localized = z.infer<typeof localizedText>;

const identifier = z.string().regex(/^[a-z0-9][a-z0-9_]{0,39}$/);

function unique(values: string[]): boolean {
  return new Set(values).size === values.length;
}

const briefingQuestionSchema = z.object({ id: identifier, text: localizedText });

const briefingBlockSchema = z.object({
  id: identifier,
  title: localizedText,
  minutes: z.number().int().min(1).max(120),
  goal: localizedText,
  questions: z.array(briefingQuestionSchema).min(1).max(20),
});

export const briefingGuideSchema = z
  .object({ blocks: z.array(briefingBlockSchema).length(BRIEFING_BLOCK_COUNT) })
  .refine((guide) => unique(guide.blocks.map((block) => block.id)), {
    message: 'Block ids must be unique',
  })
  .refine(
    (guide) =>
      unique(guide.blocks.flatMap((block) => block.questions.map((question) => question.id))),
    { message: 'Question ids must be unique' },
  );

export type BriefingGuide = z.infer<typeof briefingGuideSchema>;
export type BriefingBlock = BriefingGuide['blocks'][number];

const orbitCriterionSchema = z.object({
  id: identifier,
  name: localizedText,
  observes: localizedText,
  maxPoints: z.number().int().min(1).max(ORBIT_FRONT_MAX_POINTS),
});

const orbitFrontSchema = z
  .object({
    front: z.enum(['core', 'orbit', 'gravity', 'constellation']),
    criteria: z.array(orbitCriterionSchema).min(1).max(25),
  })
  .refine(
    (front) =>
      front.criteria.reduce((total, criterion) => total + criterion.maxPoints, 0) ===
      ORBIT_FRONT_MAX_POINTS,
    { message: 'Each front must sum to 25 points' },
  );

export const orbitGridSchema = z
  .object({ fronts: z.array(orbitFrontSchema).length(ORBIT_FRONTS.length) })
  .refine(
    (grid) =>
      unique(grid.fronts.map((front) => front.front)) &&
      ORBIT_FRONTS.every((front) => grid.fronts.some((entry) => entry.front === front)),
    { message: 'The grid must contain each front once' },
  )
  .refine(
    (grid) =>
      unique(grid.fronts.flatMap((front) => front.criteria.map((criterion) => criterion.id))),
    { message: 'Criterion ids must be unique' },
  );

export type OrbitGrid = z.infer<typeof orbitGridSchema>;
export type OrbitCriterion = OrbitGrid['fronts'][number]['criteria'][number];
