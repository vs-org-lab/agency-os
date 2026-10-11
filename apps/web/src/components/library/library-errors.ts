export const LIBRARY_ERRORS = [
  'not_found',
  'invalid_input',
  'name_taken',
  'too_deep',
  'storage_full',
  'invalid_file',
  'zip_too_large',
  'upload_failed',
  'download_failed',
] as const;

export type LibraryError = (typeof LIBRARY_ERRORS)[number];

export function libraryError(code: string): LibraryError {
  return (LIBRARY_ERRORS as readonly string[]).includes(code)
    ? (code as LibraryError)
    : 'not_found';
}
