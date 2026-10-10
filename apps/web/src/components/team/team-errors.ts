export type TeamActionResult = { ok: true } | { ok: false; code: string };

export const TEAM_ERRORS = [
  'not_found',
  'invalid_input',
  'invalid_state',
  'last_founder',
  'last_decision_maker',
] as const;

export type TeamError = (typeof TEAM_ERRORS)[number];

export function teamError(code: string): TeamError {
  return (TEAM_ERRORS as readonly string[]).includes(code) ? (code as TeamError) : 'not_found';
}

export const TEAM_FIELD =
  'h-11 rounded-md border border-border bg-surface px-3 text-body text-text md:h-9';
