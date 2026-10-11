import { randomUUID } from 'node:crypto';
import { and, eq, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction, type LibraryFileKind } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import type { VerifiedClaims } from '@/platform/db';
import {
  libraryWriter,
  loadFolder,
  NOT_FOUND,
  uuid,
  type FolderRecord,
  type LibraryDeps,
  type LibraryWriter,
  type NotFound,
} from './access';
import { detectLibraryType } from './domain/file-type';
import {
  LIBRARY_LINK_TTL_SECONDS,
  MAX_FOLDER_DEPTH,
  MAX_LIBRARY_BYTES,
  MAX_UPLOAD_BATCH,
  STALE_UPLOAD_MS,
} from './domain/limits';
import { normaliseUploadPath, type UploadPath } from './domain/paths';
import { childFolder, writesUnder } from './folders';
import { fitsStorage } from './quota';
import { libraryPath } from './storage';

const { libraryFiles, libraryFolders } = schema;

const uploadSchema = z
  .array(
    z.object({
      path: z.string().max(2000),
      sizeBytes: z.number().int().min(1).max(MAX_LIBRARY_BYTES),
    }),
  )
  .min(1)
  .max(MAX_UPLOAD_BATCH);

type Upload = { fileId: string; path: string; uploadUrl: string };

/** The folder for a path's segments under the target, created or reused one level at a time. */
async function folderFor(
  tx: DbTransaction,
  writer: LibraryWriter,
  target: FolderRecord,
  segments: string[],
  cache: Map<string, { id: string; rootId: string; depth: number }>,
): Promise<string> {
  let parent = { id: target.id, rootId: target.rootId, depth: target.depth };
  let key = '';
  for (const segment of segments) {
    key = `${key}/${segment.toLowerCase()}`;
    const cached = cache.get(key);
    if (cached) {
      parent = cached;
      continue;
    }
    const folder =
      (await childFolder(tx, writer, parent, segment)) ??
      (await childFolder(tx, writer, parent, segment));
    if (!folder) throw new Error('Library folder could not be resolved');
    if (folder.created) {
      await recordAudit(tx, {
        organizationId: writer.organizationId,
        action: 'library.folder_created',
        resourceType: 'library_folder',
        resourceId: folder.id,
        clientId: writer.clientId,
      });
    }
    parent = { id: folder.id, rootId: target.rootId, depth: parent.depth + 1 };
    cache.set(key, parent);
  }
  return parent.id;
}

/**
 * Upload links for a batch of files into a folder (RF-081). Paths from "Carregar pasta" create, or
 * reuse by name, the subfolders they name. Each file waits as `uploading` until confirmed.
 */
export async function requestUploads(
  claims: VerifiedClaims,
  input: { folderId: string; files: { path: string; sizeBytes: number }[] },
  deps: LibraryDeps,
): Promise<
  | { ok: true; uploads: Upload[] }
  | NotFound
  | { ok: false; rule: 'invalid_input' | 'too_deep' | 'storage_full' }
> {
  const target = await loadFolder(input.folderId, deps);
  if (!target) return NOT_FOUND;
  const writer = await libraryWriter(claims, target.projectId, deps);
  if (!writer || !writesUnder(writer, target)) return NOT_FOUND;
  const files = uploadSchema.safeParse(input.files);
  if (!files.success) return { ok: false, rule: 'invalid_input' };
  const paths: UploadPath[] = [];
  for (const file of files.data) {
    const path = normaliseUploadPath(file.path);
    if (!path) return { ok: false, rule: 'invalid_input' };
    paths.push(path);
  }
  if (paths.some((path) => target.depth + path.segments.length > MAX_FOLDER_DEPTH)) {
    return { ok: false, rule: 'too_deep' };
  }
  const declared = files.data.reduce((total, file) => total + file.sizeBytes, 0);

  const created = await deps.contexts.withSystemContext(async (tx) => {
    if (!(await fitsStorage(tx, writer.organizationId, declared))) return null;
    const cache = new Map<string, { id: string; rootId: string; depth: number }>();
    const rows: { fileId: string; path: string; storagePath: string }[] = [];
    for (const [index, path] of paths.entries()) {
      const folderId = await folderFor(tx, writer, target, path.segments, cache);
      const fileId = randomUUID();
      const storagePath = libraryPath({ ...writer, fileId });
      await tx.insert(libraryFiles).values({
        id: fileId,
        organizationId: writer.organizationId,
        clientId: writer.clientId,
        projectId: writer.projectId,
        folderId,
        rootId: target.rootId,
        name: path.fileName,
        storagePath,
        sizeBytes: files.data[index]?.sizeBytes ?? null,
        uploadedBy: writer.actorId,
      });
      rows.push({ fileId, path: [...path.segments, path.fileName].join('/'), storagePath });
    }
    return rows;
  });
  if (!created) return { ok: false, rule: 'storage_full' };
  const uploads: Upload[] = [];
  for (const row of created) {
    uploads.push({
      fileId: row.fileId,
      path: row.path,
      uploadUrl: await deps.storage.createUploadUrl(row.storagePath),
    });
  }
  return { ok: true, uploads };
}

type FileRecord = {
  id: string;
  projectId: string;
  organizationId: string;
  clientId: string;
  name: string;
  storagePath: string;
  status: string;
  sizeBytes: number | null;
  uploadedBy: string | null;
  rootVisibility: string | null;
};

async function loadFile(fileId: string, deps: LibraryDeps): Promise<FileRecord | null> {
  if (!uuid.safeParse(fileId).success) return null;
  const [row] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({
        id: libraryFiles.id,
        projectId: libraryFiles.projectId,
        organizationId: libraryFiles.organizationId,
        clientId: libraryFiles.clientId,
        name: libraryFiles.name,
        storagePath: libraryFiles.storagePath,
        status: libraryFiles.status,
        sizeBytes: libraryFiles.sizeBytes,
        uploadedBy: libraryFiles.uploadedBy,
        rootVisibility: libraryFolders.visibility,
      })
      .from(libraryFiles)
      .innerJoin(libraryFolders, eq(libraryFolders.id, libraryFiles.rootId))
      .where(eq(libraryFiles.id, fileId)),
  );
  return row ?? null;
}

/** Whether the writer may act on a file: the team always, the operational user on their own. */
function ownsFile(writer: LibraryWriter, file: FileRecord): boolean {
  if (writer.role === 'team') return true;
  return file.uploadedBy === writer.actorId && file.rootVisibility === 'client';
}

/**
 * Checks the uploaded bytes (SEC-30): the size and the real type from the first bytes. A file that
 * fails is removed and rejected; one that passes becomes ready with its real type and size.
 */
export async function confirmUpload(
  claims: VerifiedClaims,
  input: { fileId: string },
  deps: LibraryDeps,
): Promise<{ ok: true; kind: LibraryFileKind } | NotFound | { ok: false; rule: 'invalid_file' }> {
  const file = await loadFile(input.fileId, deps);
  if (!file || file.status !== 'uploading') return NOT_FOUND;
  const writer = await libraryWriter(claims, file.projectId, deps);
  if (!writer || !ownsFile(writer, file)) return NOT_FOUND;

  const bytes = await deps.storage.download(file.storagePath);
  const declaredSize = bytes !== null && bytes.length === file.sizeBytes;
  const detected =
    bytes && declaredSize && bytes.length <= MAX_LIBRARY_BYTES
      ? detectLibraryType(bytes, file.name)
      : null;
  if (!bytes || !detected) {
    await deps.storage.remove(file.storagePath);
    await deps.contexts.withSystemContext(async (tx) => {
      await tx.update(libraryFiles).set({ status: 'rejected' }).where(eq(libraryFiles.id, file.id));
      await recordAudit(tx, {
        organizationId: file.organizationId,
        action: 'library.file_rejected',
        resourceType: 'library_file',
        resourceId: file.id,
        clientId: file.clientId,
      });
    });
    return { ok: false, rule: 'invalid_file' };
  }
  await deps.contexts.withSystemContext(async (tx) => {
    await tx
      .update(libraryFiles)
      .set({
        status: 'ready',
        kind: detected.kind,
        mimeType: detected.mimeType,
        sizeBytes: bytes.length,
      })
      .where(and(eq(libraryFiles.id, file.id), eq(libraryFiles.status, 'uploading')));
    await recordAudit(tx, {
      organizationId: file.organizationId,
      action: 'library.file_uploaded',
      resourceType: 'library_file',
      resourceId: file.id,
      clientId: file.clientId,
      metadata: { kind: detected.kind, sizeBytes: bytes.length },
    });
  });
  return { ok: true, kind: detected.kind };
}

export async function deleteFile(
  claims: VerifiedClaims,
  input: { fileId: string },
  deps: LibraryDeps,
): Promise<{ ok: true } | NotFound> {
  const file = await loadFile(input.fileId, deps);
  if (!file) return NOT_FOUND;
  const writer = await libraryWriter(claims, file.projectId, deps);
  if (!writer || !ownsFile(writer, file)) return NOT_FOUND;
  await deps.contexts.withSystemContext(async (tx) => {
    await tx.delete(libraryFiles).where(eq(libraryFiles.id, file.id));
    await recordAudit(tx, {
      organizationId: file.organizationId,
      action: 'library.file_deleted',
      resourceType: 'library_file',
      resourceId: file.id,
      clientId: file.clientId,
      metadata: { name: file.name },
    });
  });
  await deps.storage.remove(file.storagePath);
  return { ok: true };
}

/** Whether the caller reads the ready file: the team under row level security, the client through the portal view. */
export async function readableFileIds(
  claims: VerifiedClaims,
  fileIds: string[],
  deps: LibraryDeps,
): Promise<Set<string>> {
  if (fileIds.length === 0) return new Set();
  const ids = sql.join(
    fileIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const rows = await deps.contexts.withUserContext(claims, (tx) =>
    tx.execute<{ id: string }>(sql`
      select id from ${libraryFiles}
      where id in (${ids}) and status = 'ready'
      union
      select id from public.portal_library_files where id in (${ids})
    `),
  );
  return new Set(rows.map((row) => row.id));
}

/** A 15-minute link that downloads the file under its name, for whoever may read it (SEC-31). */
export async function libraryFileUrl(
  claims: VerifiedClaims,
  fileId: string,
  deps: LibraryDeps,
): Promise<string | null> {
  if (!uuid.safeParse(fileId).success) return null;
  if (!(await readableFileIds(claims, [fileId], deps)).has(fileId)) return null;
  const file = await loadFile(fileId, deps);
  if (!file) return null;
  return deps.storage.signedDownloadUrl(file.storagePath, LIBRARY_LINK_TTL_SECONDS, file.name);
}

/**
 * Closes uploads whose signed link has expired without a confirmation: the rows are rejected and
 * any bytes sent to them are removed, so an unconfirmed upload never keeps storage.
 */
export async function sweepStaleUploads(deps: LibraryDeps): Promise<{ removed: number }> {
  const cutoff = new Date((deps.now?.() ?? new Date()).getTime() - STALE_UPLOAD_MS);
  const stale = await deps.contexts.withSystemContext((tx) =>
    tx
      .update(libraryFiles)
      .set({ status: 'rejected' })
      .where(and(eq(libraryFiles.status, 'uploading'), lt(libraryFiles.createdAt, cutoff)))
      .returning({ storagePath: libraryFiles.storagePath }),
  );
  await deps.storage.removeMany(stale.map((file) => file.storagePath));
  return { removed: stale.length };
}
