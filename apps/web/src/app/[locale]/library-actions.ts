'use server';

import type { ActionResult } from '@/components/library/upload-files';
import type { ZipManifest } from '@/modules/library';
import {
  createLibraryFolder,
  deleteLibraryFolder,
  finishLibraryUpload,
  libraryZip,
  removeLibraryFile,
  renameLibraryFolder,
  setLibraryFolderVisibility,
  startLibraryUploads,
} from '@/modules/library/server';
import { getVerifiedClaims } from '@/platform/session';

const NOT_FOUND = { ok: false, code: 'not_found' } as const;

function outcome(result: { ok: true } | { ok: false; rule: string }): ActionResult {
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}

export async function createFolderAction(input: {
  projectId: string;
  parentId: string | null;
  name: string;
}): Promise<ActionResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return NOT_FOUND;
  const result = await createLibraryFolder(claims, input);
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}

export async function renameFolderAction(folderId: string, name: string): Promise<ActionResult> {
  const claims = await getVerifiedClaims();
  return claims ? outcome(await renameLibraryFolder(claims, folderId, name)) : NOT_FOUND;
}

export async function setFolderVisibilityAction(
  folderId: string,
  visibility: 'internal' | 'client',
): Promise<ActionResult> {
  const claims = await getVerifiedClaims();
  return claims
    ? outcome(await setLibraryFolderVisibility(claims, folderId, visibility))
    : NOT_FOUND;
}

export async function deleteFolderAction(folderId: string): Promise<ActionResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return NOT_FOUND;
  const result = await deleteLibraryFolder(claims, folderId);
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}

export async function startUploadsAction(
  folderId: string,
  files: { path: string; sizeBytes: number }[],
): Promise<
  | { ok: true; uploads: { fileId: string; path: string; uploadUrl: string }[] }
  | { ok: false; code: string }
> {
  const claims = await getVerifiedClaims();
  if (!claims) return NOT_FOUND;
  const result = await startLibraryUploads(claims, folderId, files);
  return result.ok ? { ok: true, uploads: result.uploads } : { ok: false, code: result.rule };
}

export async function finishUploadAction(fileId: string): Promise<ActionResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return NOT_FOUND;
  const result = await finishLibraryUpload(claims, fileId);
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}

export async function deleteFileAction(fileId: string): Promise<ActionResult> {
  const claims = await getVerifiedClaims();
  return claims ? outcome(await removeLibraryFile(claims, fileId)) : NOT_FOUND;
}

export async function zipAction(
  projectId: string,
  folderId: string | null,
): Promise<ZipManifest | { ok: false; code: string }> {
  const claims = await getVerifiedClaims();
  if (!claims) return NOT_FOUND;
  const result = await libraryZip(claims, projectId, folderId);
  return result.ok ? result : { ok: false, code: result.rule };
}
