export type ActionResult = { ok: true } | { ok: false; code: string };

export const DOCUMENT_ERRORS = [
  'not_found',
  'invalid_input',
  'invalid_state',
  'invalid_file',
  'storage_full',
  'upload_failed',
  'comment_required',
] as const;

export type DocumentError = (typeof DOCUMENT_ERRORS)[number];

export function documentError(code: string): DocumentError {
  return (DOCUMENT_ERRORS as readonly string[]).includes(code)
    ? (code as DocumentError)
    : 'not_found';
}
