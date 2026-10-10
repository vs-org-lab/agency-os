import 'server-only';
import type { UpdateVisibility } from '@agency-os/db';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import type { LibraryDeps } from './access';
import { libraryFileUrl, confirmUpload, deleteFile, requestUploads } from './files';
import { createFolder, deleteFolder, renameFolder, setFolderVisibility } from './folders';
import { attachableFiles, loadLibrary } from './readers';
import { createSupabaseLibraryStorage } from './supabase-storage';
import type { LibraryQuery } from './views';
import { zipManifest } from './zip';

const deps = (): LibraryDeps => ({
  contexts: { withUserContext, withSystemContext },
  storage: createSupabaseLibraryStorage(),
});

export function loadStaffLibrary(claims: VerifiedClaims, clientId: string, query: LibraryQuery) {
  return loadLibrary(claims, { clientId, ...query }, 'staff', deps());
}

export function loadPortalLibrary(claims: VerifiedClaims, clientId: string, query: LibraryQuery) {
  return loadLibrary(claims, { clientId, ...query }, 'portal', deps());
}

export function loadAttachableFiles(claims: VerifiedClaims, projectId: string) {
  return attachableFiles(claims, projectId, deps());
}

export function createLibraryFolder(
  claims: VerifiedClaims,
  input: { projectId: string; parentId: string | null; name: string },
) {
  return createFolder(claims, input, deps());
}

export function renameLibraryFolder(claims: VerifiedClaims, folderId: string, name: string) {
  return renameFolder(claims, { folderId, name }, deps());
}

export function setLibraryFolderVisibility(
  claims: VerifiedClaims,
  folderId: string,
  visibility: UpdateVisibility,
) {
  return setFolderVisibility(claims, { folderId, visibility }, deps());
}

export function deleteLibraryFolder(claims: VerifiedClaims, folderId: string) {
  return deleteFolder(claims, { folderId }, deps());
}

export function startLibraryUploads(
  claims: VerifiedClaims,
  folderId: string,
  files: { path: string; sizeBytes: number }[],
) {
  return requestUploads(claims, { folderId, files }, deps());
}

export function finishLibraryUpload(claims: VerifiedClaims, fileId: string) {
  return confirmUpload(claims, { fileId }, deps());
}

export function removeLibraryFile(claims: VerifiedClaims, fileId: string) {
  return deleteFile(claims, { fileId }, deps());
}

export function libraryFileLink(claims: VerifiedClaims, fileId: string) {
  return libraryFileUrl(claims, fileId, deps());
}

export function libraryZip(claims: VerifiedClaims, projectId: string, folderId: string | null) {
  return zipManifest(claims, { projectId, folderId }, deps());
}
