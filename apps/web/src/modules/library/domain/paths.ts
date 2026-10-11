import { MAX_FILE_NAME_LENGTH, MAX_FOLDER_NAME_LENGTH } from './limits';

/** Separators and control characters never belong in a folder or file name. */
const UNSAFE_CHARACTERS = /[/\\\u0000-\u001f\u007f]/;

/** A folder or file name that cannot act as a path: no separators, control characters, `.` or `..`. */
export function isSafeName(name: string): boolean {
  return name !== '.' && name !== '..' && !UNSAFE_CHARACTERS.test(name);
}

export type UploadPath = { segments: string[]; fileName: string };

/**
 * The folders and the file name of a path sent by "Carregar pasta". Backslashes count as
 * separators, empty and `.` segments are dropped, and `..` is refused so a path never leaves the
 * target folder.
 */
export function normaliseUploadPath(relativePath: string): UploadPath | null {
  if (/[/\\]\s*$/.test(relativePath)) return null;
  const parts = relativePath
    .split(/[/\\]+/)
    .map((part) => part.trim())
    .filter((part) => part !== '' && part !== '.');
  if (parts.includes('..')) return null;
  const fileName = parts.pop();
  if (!fileName || fileName.length > MAX_FILE_NAME_LENGTH || !isSafeName(fileName)) return null;
  if (parts.some((segment) => !isSafeName(segment))) return null;
  if (parts.some((segment) => segment.length > MAX_FOLDER_NAME_LENGTH)) return null;
  return { segments: parts, fileName };
}
