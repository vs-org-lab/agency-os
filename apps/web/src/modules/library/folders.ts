import { randomUUID } from 'node:crypto';
import { and, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction, type UpdateVisibility } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import type { VerifiedClaims } from '@/platform/db';
import {
  isUniqueViolation,
  libraryWriter,
  loadFolder,
  NOT_FOUND,
  uuid,
  type FolderRecord,
  type LibraryDeps,
  type LibraryWriter,
  type NotFound,
} from './access';
import { MAX_FOLDER_DEPTH, MAX_FOLDER_NAME_LENGTH } from './domain/limits';
import { isSafeName } from './domain/paths';

const { libraryFolders, libraryFiles } = schema;

const nameSchema = z.string().trim().min(1).max(MAX_FOLDER_NAME_LENGTH).refine(isSafeName);
const visibilitySchema = z.enum(['internal', 'client']);

type InvalidInput = { ok: false; rule: 'invalid_input' };
type NameTaken = { ok: false; rule: 'name_taken' };
type TooDeep = { ok: false; rule: 'too_deep' };

type ParentFolder = Pick<FolderRecord, 'id' | 'rootId' | 'depth'>;

/**
 * The child folder with this name under the parent (or a root when the parent is null), created
 * when missing; the existing one is reused, ignoring case. Null when the name is taken by a
 * concurrent insert that this call cannot see.
 */
export async function childFolder(
  tx: DbTransaction,
  writer: LibraryWriter,
  parent: ParentFolder | null,
  name: string,
): Promise<{ id: string; created: boolean } | null> {
  const [existing] = await tx
    .select({ id: libraryFolders.id })
    .from(libraryFolders)
    .where(
      and(
        eq(libraryFolders.projectId, writer.projectId),
        parent ? eq(libraryFolders.parentId, parent.id) : sql`${libraryFolders.parentId} is null`,
        sql`lower(${libraryFolders.name}) = lower(${name})`,
      ),
    );
  if (existing) return { id: existing.id, created: false };
  const folderId = randomUUID();
  const [inserted] = await tx
    .insert(libraryFolders)
    .values({
      id: folderId,
      organizationId: writer.organizationId,
      clientId: writer.clientId,
      projectId: writer.projectId,
      parentId: parent?.id ?? null,
      rootId: parent?.rootId ?? folderId,
      depth: parent ? parent.depth + 1 : 0,
      name,
      visibility: parent ? null : 'internal',
      createdBy: writer.actorId,
    })
    .onConflictDoNothing()
    .returning({ id: libraryFolders.id });
  return inserted ? { id: inserted.id, created: true } : null;
}

/** Whether the writer may add content under this folder. */
export function writesUnder(writer: LibraryWriter, folder: FolderRecord): boolean {
  if (folder.projectId !== writer.projectId) return false;
  return writer.role === 'team' || folder.rootVisibility === 'client';
}

/** The folder and its writer when the caller is on the team of the folder's project. */
async function teamFolder(
  claims: VerifiedClaims,
  folderId: string,
  deps: LibraryDeps,
): Promise<{ folder: FolderRecord; writer: LibraryWriter } | null> {
  const folder = await loadFolder(folderId, deps);
  if (!folder) return null;
  const writer = await libraryWriter(claims, folder.projectId, deps);
  if (!writer || writer.role !== 'team') return null;
  return { folder, writer };
}

/**
 * A new folder: roots are created by the team and start internal; subfolders by the team or, under
 * a root visible to the client, by the client's operational user. Folders nest four levels deep.
 */
export async function createFolder(
  claims: VerifiedClaims,
  input: { projectId: string; parentId: string | null; name: string },
  deps: LibraryDeps,
): Promise<{ ok: true; folderId: string } | NotFound | InvalidInput | NameTaken | TooDeep> {
  const writer = await libraryWriter(claims, input.projectId, deps);
  if (!writer) return NOT_FOUND;
  let parent: FolderRecord | null = null;
  if (input.parentId !== null) {
    parent = await loadFolder(input.parentId, deps);
    if (!parent || !writesUnder(writer, parent)) return NOT_FOUND;
  } else if (writer.role !== 'team') {
    return NOT_FOUND;
  }
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return { ok: false, rule: 'invalid_input' };
  if (parent && parent.depth >= MAX_FOLDER_DEPTH) return { ok: false, rule: 'too_deep' };

  return deps.contexts.withSystemContext(async (tx) => {
    const folder = await childFolder(tx, writer, parent, name.data);
    if (!folder || !folder.created) return { ok: false as const, rule: 'name_taken' as const };
    await recordAudit(tx, {
      organizationId: writer.organizationId,
      action: 'library.folder_created',
      resourceType: 'library_folder',
      resourceId: folder.id,
      clientId: writer.clientId,
    });
    return { ok: true as const, folderId: folder.id };
  });
}

export async function renameFolder(
  claims: VerifiedClaims,
  input: { folderId: string; name: string },
  deps: LibraryDeps,
): Promise<{ ok: true } | NotFound | InvalidInput | NameTaken> {
  const access = await teamFolder(claims, input.folderId, deps);
  if (!access) return NOT_FOUND;
  const { folder, writer } = access;
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return { ok: false, rule: 'invalid_input' };
  try {
    return await deps.contexts.withSystemContext(async (tx) => {
      const [sibling] = await tx
        .select({ id: libraryFolders.id })
        .from(libraryFolders)
        .where(
          and(
            eq(libraryFolders.projectId, folder.projectId),
            folder.parentId
              ? eq(libraryFolders.parentId, folder.parentId)
              : sql`${libraryFolders.parentId} is null`,
            ne(libraryFolders.id, folder.id),
            sql`lower(${libraryFolders.name}) = lower(${name.data})`,
          ),
        );
      if (sibling) return { ok: false as const, rule: 'name_taken' as const };
      await tx
        .update(libraryFolders)
        .set({ name: name.data, updatedAt: sql`now()` })
        .where(eq(libraryFolders.id, folder.id));
      await recordAudit(tx, {
        organizationId: writer.organizationId,
        action: 'library.folder_renamed',
        resourceType: 'library_folder',
        resourceId: folder.id,
        clientId: writer.clientId,
      });
      return { ok: true as const };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, rule: 'name_taken' };
    throw error;
  }
}

/** RF-083: only roots carry visibility; their subfolders and files follow it. */
export async function setFolderVisibility(
  claims: VerifiedClaims,
  input: { folderId: string; visibility: UpdateVisibility },
  deps: LibraryDeps,
): Promise<{ ok: true } | NotFound | InvalidInput> {
  const access = await teamFolder(claims, input.folderId, deps);
  if (!access) return NOT_FOUND;
  const { folder, writer } = access;
  const visibility = visibilitySchema.safeParse(input.visibility);
  if (!visibility.success || folder.parentId !== null) return { ok: false, rule: 'invalid_input' };
  await deps.contexts.withSystemContext(async (tx) => {
    await tx
      .update(libraryFolders)
      .set({ visibility: visibility.data, updatedAt: sql`now()` })
      .where(eq(libraryFolders.id, folder.id));
    await recordAudit(tx, {
      organizationId: writer.organizationId,
      action: 'library.folder_visibility_set',
      resourceType: 'library_folder',
      resourceId: folder.id,
      clientId: writer.clientId,
      metadata: { visibility: visibility.data },
    });
  });
  return { ok: true };
}

/** Deletes the folder, its subfolders and files, and their stored objects. */
export async function deleteFolder(
  claims: VerifiedClaims,
  input: { folderId: string },
  deps: LibraryDeps,
): Promise<{ ok: true; removed: number } | NotFound> {
  if (!uuid.safeParse(input.folderId).success) return NOT_FOUND;
  const access = await teamFolder(claims, input.folderId, deps);
  if (!access) return NOT_FOUND;
  const { folder, writer } = access;
  const paths = await deps.contexts.withSystemContext(async (tx) => {
    const files = await tx.execute<{ storage_path: string }>(sql`
      with recursive tree as (
        select id from ${libraryFolders} where id = ${folder.id}::uuid
        union all
        select child.id from ${libraryFolders} child join tree on child.parent_id = tree.id
      )
      select storage_path from ${libraryFiles} where folder_id in (select id from tree)
    `);
    await tx.delete(libraryFolders).where(eq(libraryFolders.id, folder.id));
    await recordAudit(tx, {
      organizationId: writer.organizationId,
      action: 'library.folder_deleted',
      resourceType: 'library_folder',
      resourceId: folder.id,
      clientId: writer.clientId,
      metadata: { name: folder.name, files: files.length },
    });
    return files.map((file) => file.storage_path);
  });
  await deps.storage.removeMany(paths);
  return { ok: true, removed: paths.length };
}
