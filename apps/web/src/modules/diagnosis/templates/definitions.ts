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

/** A structured answer beside the free note, so onboarding requests can depend on it. */
const answerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('yes_no') }),
  z.object({
    kind: z.literal('choice'),
    options: z
      .array(z.object({ id: identifier, label: localizedText }))
      .min(2)
      .max(8)
      .refine((options) => unique(options.map((option) => option.id)), {
        message: 'Option ids must be unique',
      }),
  }),
]);

export type BriefingAnswer = z.infer<typeof answerSchema>;

export const YES_NO_VALUES = ['yes', 'no'] as const;

/** The values an answer takes: yes or no, or the id of an option. */
export function answerValues(answer: BriefingAnswer): string[] {
  return answer.kind === 'yes_no' ? [...YES_NO_VALUES] : answer.options.map((option) => option.id);
}

const briefingQuestionSchema = z.object({
  id: identifier,
  text: localizedText,
  answer: answerSchema.optional(),
});

/** The contract modules (A video, B social, C ads, D web, E automations) a request can follow. */
export const ONBOARDING_MODULE_CODES = ['A', 'B', 'C', 'D', 'E'] as const;

export const ONBOARDING_REQUEST_KINDS = ['upload', 'text', 'access', 'confirm'] as const;
export type OnboardingRequestKind = (typeof ONBOARDING_REQUEST_KINDS)[number];

const onboardingConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('always') }),
  z.object({ type: z.literal('answer'), questionId: identifier, equals: identifier }),
  z.object({ type: z.literal('module'), code: z.enum(ONBOARDING_MODULE_CODES) }),
]);

export type OnboardingCondition = z.infer<typeof onboardingConditionSchema>;

const longLocalizedText = z.object({
  'pt-PT': z.string().trim().min(1).max(1000),
  en: z.string().trim().min(1).max(1000),
});

const onboardingRequestSchema = z.object({
  id: identifier,
  kind: z.enum(ONBOARDING_REQUEST_KINDS),
  title: localizedText,
  body: longLocalizedText,
  when: onboardingConditionSchema,
});

export type OnboardingRequest = z.infer<typeof onboardingRequestSchema>;
export const MAX_ONBOARDING_REQUESTS = 20;

const briefingBlockSchema = z.object({
  id: identifier,
  title: localizedText,
  minutes: z.number().int().min(1).max(120),
  goal: localizedText,
  questions: z.array(briefingQuestionSchema).min(1).max(20),
});

export const briefingGuideSchema = z
  .object({
    blocks: z.array(briefingBlockSchema).length(BRIEFING_BLOCK_COUNT),
    onboarding: z.array(onboardingRequestSchema).max(MAX_ONBOARDING_REQUESTS).default([]),
  })
  .refine((guide) => unique(guide.blocks.map((block) => block.id)), {
    message: 'Block ids must be unique',
  })
  .refine(
    (guide) =>
      unique(guide.blocks.flatMap((block) => block.questions.map((question) => question.id))),
    { message: 'Question ids must be unique' },
  )
  .refine((guide) => unique(guide.onboarding.map((request) => request.id)), {
    message: 'Onboarding request ids must be unique',
  })
  .refine(
    (guide) =>
      guide.onboarding.every((request) => {
        if (request.when.type !== 'answer') return true;
        const { questionId, equals } = request.when;
        const question = guide.blocks
          .flatMap((block) => block.questions)
          .find((entry) => entry.id === questionId);
        return question?.answer ? answerValues(question.answer).includes(equals) : false;
      }),
    { message: 'An answer condition must name a structured answer of the guide' },
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
