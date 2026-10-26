export type TaskActionResult = { ok: true } | { ok: false; code: string };

export const TASK_ERRORS = ['not_found', 'invalid_input'] as const;

export type TaskError = (typeof TASK_ERRORS)[number];

export function taskError(code: string): TaskError {
  return (TASK_ERRORS as readonly string[]).includes(code) ? (code as TaskError) : 'not_found';
}

export type TaskOptionView = { id: string; name: string };
