import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type UpdateVisibility } from '@agency-os/db';
import { projectEditor } from '@/modules/rooms/server';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import type { LibraryStorage } from './storage';

const { libraryFolders, projects } = schema;

export type LibraryDeps = {
  contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'>;
  storage: LibraryStorage;
  now?: () => Date;
};

export type NotFound = { ok: false; rule: 'not_found' };
export const NOT_FOUND: NotFound = { ok: false, rule: 'not_found' };

export const uuid = z.uuid();

export type ProjectScope = { organizationId: string; clientId: string; projectId: string };

/**
 * Who writes in a project's library: the team (room writers and the project's freelancer, as
 * `projectEditor` resolves them), the client's operational user, who works only under roots
 * visible to the client, or the client's decision maker, who writes only under the root that
 * receives their onboarding files (ADR 0007).
 */
export type LibraryWriter = ProjectScope & {
  actorId: string;
  role: 'team' | 'operational' | 'decision_maker';
};

export async function libraryWriter(
  claims: VerifiedClaims,
  projectId: string,
  deps: Pick<LibraryDeps, 'contexts'>,
): Promise<LibraryWriter | null> {
  if (!uuid.safeParse(projectId).success) return null;
  const [project] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({
        organizationId: projects.organizationId,
        clientId: projects.clientId,
        status: projects.status,
      })
      .from(projects)
      .where(eq(projects.id, projectId)),
  );
  if (!project || project.status === 'cancelled') return null;
  const scope = { organizationId: project.organizationId, clientId: project.clientId, projectId };

  if (claims.user_kind === 'client') {
    const member = await deps.contexts.withUserContext(claims, async (tx) => {
      const rows = await tx.execute<{ operational: boolean; decides: boolean }>(sql`
        select app.is_client_member(${project.clientId}::uuid,
                                    array['operational']::app.client_role[]) as operational,
               app.is_client_member(${project.clientId}::uuid,
                                    array['decision_maker']::app.client_role[]) as decides
      `);
      return rows[0];
    });
    if (member?.operational) return { ...scope, actorId: claims.sub, role: 'operational' };
    if (member?.decides) return { ...scope, actorId: claims.sub, role: 'decision_maker' };
    return null;
  }

  const editor = await projectEditor(deps.contexts, claims, project.clientId, projectId);
  if (!editor || editor.organizationId !== project.organizationId) return null;
  return { ...scope, actorId: editor.userId, role: 'team' };
}

export type FolderRecord = ProjectScope & {
  id: string;
  parentId: string | null;
  rootId: string;
  depth: number;
  name: string;
  rootVisibility: UpdateVisibility;
  /** The root receives the client's onboarding files. */
  rootClientUploads: boolean;
};

export async function loadFolder(
  folderId: string,
  deps: Pick<LibraryDeps, 'contexts'>,
): Promise<FolderRecord | null> {
  if (!uuid.safeParse(folderId).success) return null;
  const rows = await deps.contexts.withSystemContext((tx) =>
    tx.execute<{
      id: string;
      organization_id: string;
      client_id: string;
      project_id: string;
      parent_id: string | null;
      root_id: string;
      depth: number;
      name: string;
      root_visibility: UpdateVisibility;
      root_client_uploads: boolean;
    }>(sql`
      select f.id, f.organization_id, f.client_id, f.project_id, f.parent_id, f.root_id, f.depth,
             f.name, r.visibility as root_visibility, r.client_uploads as root_client_uploads
      from ${libraryFolders} f
      join ${libraryFolders} r on r.id = f.root_id
      where f.id = ${folderId}::uuid
    `),
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    projectId: row.project_id,
    parentId: row.parent_id,
    rootId: row.root_id,
    depth: Number(row.depth),
    name: row.name,
    rootVisibility: row.root_visibility,
    rootClientUploads: row.root_client_uploads,
  };
}

/** True when a write failed on a unique constraint. */
export function isUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error; current; current = (current as { cause?: unknown }).cause) {
    if ((current as { code?: unknown }).code === '23505') return true;
  }
  return false;
}
