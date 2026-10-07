import { z } from 'zod';
import type { ApplicationPath } from '@agency-os/db';
import type { ApplicationFormDefinition, FormQuestion } from './form-definition';

export type ApplicationAnswers = {
  contact: { fullName: string; email: string };
  company: { name: string; website: string | null };
  choices: Record<string, string>;
  texts: Record<string, string>;
};

export type ScoreResult = { score: number; path: ApplicationPath; knockouts: string[] };

export const MAX_TEXT_LENGTH = 2000;

function isVisible(question: FormQuestion, choices: Record<string, string>): boolean {
  if (!question.showIf) return true;
  return choices[question.showIf.questionId] === question.showIf.optionId;
}

export function visibleQuestions(
  definition: ApplicationFormDefinition,
  choices: Record<string, string>,
): FormQuestion[] {
  return definition.questions.filter((question) => isVisible(question, choices));
}

export function scoreApplication(
  definition: ApplicationFormDefinition,
  answers: ApplicationAnswers,
): ScoreResult {
  let score = 0;
  const knockouts: string[] = [];

  for (const question of visibleQuestions(definition, answers.choices)) {
    if (question.kind !== 'single_choice') continue;
    const option = (question.options ?? []).find(
      (entry) => entry.id === answers.choices[question.id],
    );
    if (!option) continue;
    if (option.knockout) knockouts.push(question.id);
    score += option.points ?? 0;
  }

  if (knockouts.length > 0) return { score, path: 'c', knockouts };
  if (score >= definition.thresholds.a) return { score, path: 'a', knockouts };
  if (score >= definition.thresholds.b) return { score, path: 'b', knockouts };
  return { score, path: 'c', knockouts };
}

const answersShape = z.object({
  contact: z.object({
    fullName: z.string().trim().min(1).max(200),
    email: z.email().max(320),
  }),
  company: z.object({
    name: z.string().trim().min(1).max(200),
    website: z.string().trim().max(500).nullable(),
  }),
  choices: z.record(z.string(), z.string().max(40)),
  texts: z.record(z.string(), z.string().max(MAX_TEXT_LENGTH)),
});

export function answersSchemaFor(
  definition: ApplicationFormDefinition,
): z.ZodType<ApplicationAnswers> {
  return answersShape.superRefine((answers, context) => {
    for (const question of visibleQuestions(definition, answers.choices)) {
      if (question.kind === 'single_choice') {
        const chosen = answers.choices[question.id];
        if (chosen === undefined) {
          if (question.required) {
            context.addIssue({
              code: 'custom',
              message: 'required',
              path: ['choices', question.id],
            });
          }
          continue;
        }
        if (!(question.options ?? []).some((option) => option.id === chosen)) {
          context.addIssue({
            code: 'custom',
            message: 'invalid_option',
            path: ['choices', question.id],
          });
        }
      }
      if (question.kind === 'long_text' && question.required) {
        if ((answers.texts[question.id] ?? '').trim() === '') {
          context.addIssue({ code: 'custom', message: 'required', path: ['texts', question.id] });
        }
      }
    }
  });
}
