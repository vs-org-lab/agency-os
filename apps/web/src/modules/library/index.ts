export { detectLibraryType, type DetectedLibraryType } from './domain/file-type';
export {
  LIBRARY_LINK_TTL_SECONDS,
  MAX_LIBRARY_BYTES,
  MAX_UPDATE_ATTACHMENTS,
  MAX_UPLOAD_BATCH,
  STALE_UPLOAD_MS,
} from './domain/limits';
export { isSafeName, normaliseUploadPath } from './domain/paths';
export { zipEntryNames } from './domain/zip';
export type { AttachableFile } from './readers';
export type {
  FileView,
  FolderView,
  LibraryKindFilter,
  LibraryQuery,
  LibrarySort,
  LibraryView,
} from './views';
export type { ZipManifest } from './zip';
export type { LibraryStorage } from './storage';
