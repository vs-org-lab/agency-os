export type ActionResult = { ok: true } | { ok: false; code: string };

export const HUB_ERRORS = [
  'not_found',
  'invalid_input',
  'invalid_state',
  'invalid_file',
  'storage_full',
  'limit_reached',
  'nothing_to_publish',
  'zip_too_large',
  'upload_failed',
  'download_failed',
] as const;

export type HubError = (typeof HUB_ERRORS)[number];

export function hubError(code: string): HubError {
  return (HUB_ERRORS as readonly string[]).includes(code) ? (code as HubError) : 'not_found';
}
