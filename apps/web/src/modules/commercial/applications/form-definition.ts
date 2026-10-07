import { z } from 'zod';

const localizedText = z.object({
  'pt-PT': z.string().trim().min(1).max(500),
  en: z.string().trim().min(1).max(500),
});

export type LocalizedText = z.infer<typeof localizedText>;

const identifier = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_]{0,39}$/)
  .describe('lowercase identifier');

const optionSchema = z.object({
  id: identifier,
  label: localizedText,
  points: z.number().int().min(0).max(10).nullable(),
  knockout: z.boolean(),
});

const questionSchema = z.object({
  id: identifier,
  kind: z.enum(['contact', 'company', 'single_choice', 'long_text']),
  label: localizedText,
  help: localizedText.optional(),
  required: z.boolean(),
  showIf: z.object({ questionId: identifier, optionId: identifier }).optional(),
  options: z.array(optionSchema).optional(),
});

export type FormQuestion = z.infer<typeof questionSchema>;
export type FormOption = z.infer<typeof optionSchema>;

export const applicationFormDefinitionSchema = z
  .object({
    questions: z.array(questionSchema).min(1).max(30),
    thresholds: z.object({
      a: z.number().int().min(1).max(100),
      b: z.number().int().min(0).max(100),
    }),
  })
  .superRefine((definition, context) => {
    const ids = definition.questions.map((question) => question.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', message: 'duplicate_question_id', path: ['questions'] });
    }

    for (const [index, question] of definition.questions.entries()) {
      const options = question.options ?? [];
      if (question.kind === 'single_choice') {
        if (options.length === 0) {
          context.addIssue({
            code: 'custom',
            message: 'missing_options',
            path: ['questions', index],
          });
        }
        const optionIds = options.map((option) => option.id);
        if (new Set(optionIds).size !== optionIds.length) {
          context.addIssue({
            code: 'custom',
            message: 'duplicate_option_id',
            path: ['questions', index],
          });
        }
      }
      if (question.showIf) {
        const { questionId, optionId } = question.showIf;
        const target = definition.questions
          .slice(0, index)
          .find((entry) => entry.id === questionId);
        if (!target || !(target.options ?? []).some((option) => option.id === optionId)) {
          context.addIssue({
            code: 'custom',
            message: 'dangling_show_if',
            path: ['questions', index],
          });
        }
      }
    }

    if (definition.thresholds.a <= definition.thresholds.b) {
      context.addIssue({ code: 'custom', message: 'inverted_thresholds', path: ['thresholds'] });
    }
  });

export type ApplicationFormDefinition = z.infer<typeof applicationFormDefinitionSchema>;

export function maxScore(definition: ApplicationFormDefinition): number {
  return definition.questions.reduce((total, question) => {
    const points = (question.options ?? []).map((option) => option.points ?? 0);
    return total + (points.length > 0 ? Math.max(...points) : 0);
  }, 0);
}
