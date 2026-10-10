import { MAX_FILE_NAME_LENGTH, MAX_FOLDER_NAME_LENGTH } from './limits';

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
  if (!fileName || fileName.length > MAX_FILE_NAME_LENGTH) return null;
  if (parts.some((segment) => segment.length > MAX_FOLDER_NAME_LENGTH)) return null;
  return { segments: parts, fileName };
}
