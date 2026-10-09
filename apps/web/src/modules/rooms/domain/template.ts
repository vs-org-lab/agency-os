import { z } from 'zod';
import { isPipelineCode, stageOf, type PipelineCode } from '@/modules/commercial';

export type ProcessStepDefinition = { name: string; visibleToClient: boolean; chained: boolean };

export type ProcessPhaseDefinition = {
  name: string;
  requiresApproval: boolean;
  codeOnStart: PipelineCode | null;
  codeOnDone: PipelineCode | null;
  steps: ProcessStepDefinition[];
};

export type ProcessDefinition = { phases: ProcessPhaseDefinition[] };

export const MAX_PHASES = 12;
export const MAX_STEPS_PER_PHASE = 30;

const name = z.string().trim().min(1).max(120);

const orbitCode = z
  .string()
  .refine((value) => isPipelineCode(value) && stageOf(value) === 'orbit')
  .transform((value) => value as PipelineCode)
  .nullable();

const definitionSchema = z.object({
  phases: z
    .array(
      z.object({
        name,
        requiresApproval: z.boolean(),
        codeOnStart: orbitCode,
        codeOnDone: orbitCode,
        steps: z
          .array(z.object({ name, visibleToClient: z.boolean(), chained: z.boolean() }))
          .min(1)
          .max(MAX_STEPS_PER_PHASE)
          .refine((steps) => !steps[0]?.chained, 'The first step of a phase cannot be chained'),
      }),
    )
    .min(1)
    .max(MAX_PHASES),
});

export function validateProcessDefinition(
  value: unknown,
): { ok: true; definition: ProcessDefinition } | { ok: false; issues: string[] } {
  const parsed = definitionSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    };
  }
  return { ok: true, definition: parsed.data };
}
