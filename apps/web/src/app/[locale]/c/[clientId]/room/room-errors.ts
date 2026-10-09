export type ActionResult = { ok: true } | { ok: false; code: string };

export const ROOM_ERRORS = [
  'not_found',
  'invalid_state',
  'invalid_input',
  'previous_phase_open',
  'steps_open',
  'approval_required',
  'deal_has_project',
] as const;

export type RoomError = (typeof ROOM_ERRORS)[number];

export function roomError(code: string): RoomError {
  return (ROOM_ERRORS as readonly string[]).includes(code) ? (code as RoomError) : 'not_found';
}
