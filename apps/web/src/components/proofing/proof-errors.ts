export type ProofActionResult = { ok: true } | { ok: false; code: string };

export const PROOF_ERRORS = [
  'not_found',
  'invalid_input',
  'invalid_state',
  'invalid_file',
  'upload_failed',
  'storage_full',
] as const;

export type ProofError = (typeof PROOF_ERRORS)[number];

export function proofError(code: string): ProofError {
  return (PROOF_ERRORS as readonly string[]).includes(code) ? (code as ProofError) : 'not_found';
}
