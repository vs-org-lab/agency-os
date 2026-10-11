import { inArray, sql, type SQL } from 'drizzle-orm';
import {
  schema,
  type DbTransaction,
  type LibraryFileKind,
  type ProjectStatus,
} from '@agency-os/db';
import type { VerifiedClaims } from '@/platform/db';
import { libraryWriter, uuid, type LibraryDeps } from './access';
import type { FileView, FolderView, LibraryQuery, LibraryView } from './views';

/** Where the library is read from: the tables under the team's row level security, or the portal views. */
export type LibrarySource = 'staff' | 'portal';

type Relations = {
  projects: SQL;
  folders: SQL;
  files: SQL;
  readyFiles: SQL;
  rootVisibility: (alias: SQL) => SQL;
};

const RELATIONS: Record<LibrarySource, Relations> = {
  staff: {
    projects: sql`public.projects`,
    folders: sql`public.library_folders`,
    files: sql`public.library_files`,
    readyFiles: sql`status = 'ready'`,
    rootVisibility: (alias) =>
      sql`(select r.visibility::text from public.library_folders r where r.id = ${alias}.root_id)`,
  },
  portal: {
    projects: sql`public.portal_projects`,
    folders: sql`public.portal_library_folders`,
    files: sql`public.portal_library_files`,
    readyFiles: sql`true`,
    rootVisibility: () => sql`'client'`,
  },
};

const ORDER: Record<NonNullable<LibraryQuery['sort']>, SQL> = {
  name: sql`lower(name), id`,
  date: sql`created_at desc, id`,
  size: sql`size_bytes desc, id`,
};

type FileRow = {
  id: string;
  name: string;
  kind: LibraryFileKind;
  size_bytes: string;
  created_at: string;
  uploaded_by: string | null;
  folder_name: string | null;
};

function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

type ReadResult = Omit<LibraryView, 'canWrite' | 'canCreateRoot' | 'files'> & { files: FileRow[] };

async function readLibrary(
  tx: DbTransaction,
  rel: Relations,
  clientId: string,
  query: LibraryQuery,
): Promise<ReadResult | null> {
  const projects = await tx.execute<{ id: string; name: string; status: ProjectStatus }>(sql`
    select id, name, status::text as status from ${rel.projects}
    where client_id = ${clientId}::uuid
    order by created_at desc, id
  `);
  if (projects.length === 0) return null;
  const project = projects.find((candidate) => candidate.id === query.projectId) ?? projects[0];
  if (!project) return null;
  const summaries = projects.map(({ id, name, status }) => ({ id, name, status }));

  let folder: LibraryView['folder'] = null;
  if (query.folderId && uuid.safeParse(query.folderId).success) {
    const [current] = await tx.execute<{
      id: string;
      name: string;
      visibility: 'internal' | 'client';
    }>(sql`
      select f.id, f.name, ${rel.rootVisibility(sql`f`)} as visibility
      from ${rel.folders} f
      where f.id = ${query.folderId}::uuid and f.project_id = ${project.id}::uuid
    `);
    if (current) {
      const trail = await tx.execute<{ id: string; name: string }>(sql`
        with recursive ancestors as (
          select p.id, p.name, p.parent_id, 1 as distance
          from ${rel.folders} p
          where p.id = (select parent_id from ${rel.folders} where id = ${current.id}::uuid)
          union all
          select p.id, p.name, p.parent_id, a.distance + 1
          from ${rel.folders} p join ancestors a on p.id = a.parent_id
        )
        select id, name from ancestors order by distance desc
      `);
      folder = { ...current, trail: trail.map(({ id, name }) => ({ id, name })) };
    }
  }

  const search = query.q?.trim() ?? '';
  const kindFilter = query.kind && query.kind !== 'folders' ? query.kind : null;
  const spansProject = search !== '' || kindFilter !== null;
  const parent = folder ? sql`= ${folder.id}::uuid` : sql`is null`;

  let folders: FolderView[] = [];
  if (!kindFilter) {
    const rows = await tx.execute<{
      id: string;
      name: string;
      visibility: 'internal' | 'client';
      file_count: string;
    }>(sql`
      with recursive listed as (
        select f.id, f.name, ${rel.rootVisibility(sql`f`)} as visibility
        from ${rel.folders} f
        where f.project_id = ${project.id}::uuid
          and ${search ? sql`f.name ilike ${likePattern(search)}` : sql`f.parent_id ${parent}`}
      ),
      tree as (
        select id as top, id from listed
        union all
        select tree.top, child.id from ${rel.folders} child join tree on child.parent_id = tree.id
      )
      select l.id, l.name, l.visibility,
             (select count(*) from ${rel.files} fi
              where ${rel.readyFiles} and fi.folder_id in (select id from tree where top = l.id)
             )::text as file_count
      from listed l
      order by lower(l.name), l.id
    `);
    folders = rows.map((row) => ({
      id: row.id,
      name: row.name,
      visibility: row.visibility,
      fileCount: Number(row.file_count),
    }));
  }

  let files: FileRow[] = [];
  if (query.kind !== 'folders' && (spansProject || folder)) {
    const scope = spansProject
      ? sql`project_id = ${project.id}::uuid`
      : sql`folder_id = ${folder?.id ?? null}::uuid`;
    files = await tx.execute<FileRow>(sql`
      select id, name, kind::text as kind, size_bytes::text as size_bytes,
             created_at::text as created_at, uploaded_by,
             ${spansProject ? sql`(select name from ${rel.folders} where id = folder_id)` : sql`null`}
               as folder_name
      from ${rel.files}
      where ${rel.readyFiles} and ${scope}
        ${search ? sql`and name ilike ${likePattern(search)}` : sql``}
        ${kindFilter ? sql`and kind = ${kindFilter}` : sql``}
      order by ${ORDER[query.sort ?? 'name']}
    `);
  }
  return { projects: summaries, projectId: project.id, folder, folders, files };
}

async function uploaderNames(ids: string[], deps: LibraryDeps): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ id: schema.profiles.id, name: schema.profiles.fullName })
      .from(schema.profiles)
      .where(inArray(schema.profiles.id, ids)),
  );
  return new Map(rows.map((row) => [row.id, row.name]));
}

/**
 * The library of a client's project as the caller may see it (RF-080): the folders of the current
 * folder with their file counts and its files, or the files across the project for a search or a
 * kind filter. Null when the caller reads no project of the client.
 */
export async function loadLibrary(
  claims: VerifiedClaims,
  input: { clientId: string } & LibraryQuery,
  source: LibrarySource,
  deps: LibraryDeps,
): Promise<LibraryView | null> {
  if (!uuid.safeParse(input.clientId).success) return null;
  const read = await deps.contexts.withUserContext(claims, (tx) =>
    readLibrary(tx, RELATIONS[source], input.clientId, input),
  );
  if (!read || !read.projectId) return null;
  const writer = await libraryWriter(claims, read.projectId, deps);
  const team = writer?.role === 'team' && source === 'staff';
  const operational = writer?.role === 'operational' && source === 'portal';
  const names = await uploaderNames(
    [...new Set(read.files.flatMap((file) => (file.uploaded_by ? [file.uploaded_by] : [])))],
    deps,
  );
  const files: FileView[] = read.files.map((file) => ({
    id: file.id,
    name: file.name,
    kind: file.kind,
    sizeBytes: Number(file.size_bytes),
    createdAt: file.created_at,
    uploadedByName: file.uploaded_by ? (names.get(file.uploaded_by) ?? null) : null,
    folderName: file.folder_name,
    canDelete: team || (operational && file.uploaded_by === writer?.actorId),
  }));
  return {
    ...read,
    files,
    canWrite: team || (operational && read.folder !== null),
    canCreateRoot: team,
  };
}

export type AttachableFile = {
  id: string;
  name: string;
  folderName: string;
  visibility: 'internal' | 'client';
};

/** The ready files of a project the team may attach to an update (RF-055), with their root's visibility. */
export async function attachableFiles(
  claims: VerifiedClaims,
  projectId: string,
  deps: LibraryDeps,
): Promise<AttachableFile[]> {
  const writer = await libraryWriter(claims, projectId, deps);
  if (writer?.role !== 'team') return [];
  const rows = await deps.contexts.withSystemContext((tx) =>
    tx.execute<{
      id: string;
      name: string;
      folder_name: string;
      visibility: 'internal' | 'client';
    }>(sql`
      select fi.id, fi.name, fo.name as folder_name, r.visibility::text as visibility
      from public.library_files fi
      join public.library_folders fo on fo.id = fi.folder_id
      join public.library_folders r on r.id = fi.root_id
      where fi.project_id = ${projectId}::uuid and fi.status = 'ready'
      order by lower(fi.name), fi.id
    `),
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    folderName: row.folder_name,
    visibility: row.visibility,
  }));
}
