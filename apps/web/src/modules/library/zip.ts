import { inArray, sql } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import type { VerifiedClaims } from '@/platform/db';
import { NOT_FOUND, uuid, type LibraryDeps, type NotFound } from './access';
import { LIBRARY_LINK_TTL_SECONDS, MAX_ZIP_BYTES, MAX_ZIP_FILES } from './domain/limits';
import { zipEntryNames } from './domain/zip';

export type ZipManifest = {
  ok: true;
  archiveName: string;
  entries: { path: string; url: string }[];
};

type FolderRow = { id: string; parent_id: string | null; name: string };
type FileRow = { id: string; folder_id: string; name: string; size_bytes: string };

function safeArchiveName(name: string): string {
  return `${name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'biblioteca'}.zip`;
}

/**
 * The files the caller may read under a folder, or under the whole project, with their paths in
 * the archive and short-lived links (RF-081, US-16). The browser builds the ZIP from it, so the
 * server never holds the archive.
 */
export async function zipManifest(
  claims: VerifiedClaims,
  input: { projectId: string; folderId: string | null },
  deps: LibraryDeps,
): Promise<ZipManifest | NotFound | { ok: false; rule: 'zip_too_large' }> {
  if (!uuid.safeParse(input.projectId).success) return NOT_FOUND;
  if (input.folderId !== null && !uuid.safeParse(input.folderId).success) return NOT_FOUND;
  const portal = claims.user_kind === 'client';
  const foldersRel = portal ? sql`public.portal_library_folders` : sql`public.library_folders`;
  const filesRel = portal ? sql`public.portal_library_files` : sql`public.library_files`;
  const projectsRel = portal ? sql`public.portal_projects` : sql`public.projects`;

  const read = await deps.contexts.withUserContext(claims, async (tx) => {
    const [project] = await tx.execute<{ name: string }>(sql`
      select name from ${projectsRel} where id = ${input.projectId}::uuid
    `);
    if (!project) return null;
    const folders = await tx.execute<FolderRow>(sql`
      select id, parent_id, name from ${foldersRel} where project_id = ${input.projectId}::uuid
    `);
    const files = await tx.execute<FileRow>(sql`
      select id, folder_id, name, size_bytes::text as size_bytes from ${filesRel}
      where project_id = ${input.projectId}::uuid ${portal ? sql`` : sql`and status = 'ready'`}
    `);
    return { projectName: project.name, folders, files };
  });
  if (!read) return NOT_FOUND;

  const byId = new Map(read.folders.map((folder) => [folder.id, folder]));
  const top = input.folderId === null ? null : byId.get(input.folderId);
  if (input.folderId !== null && !top) return NOT_FOUND;

  /** The folder's path from the requested folder (exclusive), or from the project root; null when outside it. */
  const pathOf = (folderId: string): string[] | null => {
    const segments: string[] = [];
    for (let current = byId.get(folderId); current; current = byId.get(current.parent_id ?? '')) {
      if (top && current.id === top.id) return segments;
      segments.unshift(current.name);
      if (!current.parent_id) break;
    }
    return top ? null : segments;
  };

  const selected = read.files
    .map((file) => ({ file, segments: pathOf(file.folder_id) }))
    .filter((entry): entry is { file: FileRow; segments: string[] } => entry.segments !== null)
    .map(({ file, segments }) => ({ file, path: [...segments, file.name].join('/') }))
    .sort((left, right) => left.path.localeCompare(right.path, 'pt'));
  const totalBytes = selected.reduce((total, entry) => total + Number(entry.file.size_bytes), 0);
  if (selected.length > MAX_ZIP_FILES || totalBytes > MAX_ZIP_BYTES) {
    return { ok: false, rule: 'zip_too_large' };
  }

  const ids = selected.map((entry) => entry.file.id);
  const stored =
    ids.length === 0
      ? []
      : await deps.contexts.withSystemContext((tx) =>
          tx
            .select({ id: schema.libraryFiles.id, storagePath: schema.libraryFiles.storagePath })
            .from(schema.libraryFiles)
            .where(inArray(schema.libraryFiles.id, ids)),
        );
  const paths = new Map(stored.map((row) => [row.id, row.storagePath]));
  const names = zipEntryNames(selected.map((entry) => entry.path));
  const entries: ZipManifest['entries'] = [];
  for (const [index, entry] of selected.entries()) {
    const storagePath = paths.get(entry.file.id);
    if (!storagePath) continue;
    entries.push({
      path: names[index] ?? entry.path,
      url: await deps.storage.signedUrl(storagePath, LIBRARY_LINK_TTL_SECONDS),
    });
  }
  return {
    ok: true,
    archiveName: safeArchiveName(top ? top.name : read.projectName),
    entries,
  };
}
