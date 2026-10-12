import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DbTransaction } from '@agency-os/db';
import { withActor } from '@/modules/access';
import type { LibraryStorage } from '@/modules/library';
import { roomActor } from '@/modules/rooms/server';
import type { DbContexts, VerifiedClaims } from '@/platform/db';

export type BrandHubDeps = {
  contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'>;
  storage: LibraryStorage;
  flush?: () => Promise<void>;
  now?: () => Date;
};

export type NotFound = { ok: false; rule: 'not_found' };
export const NOT_FOUND: NotFound = { ok: false, rule: 'not_found' };
export const INVALID_INPUT = { ok: false, rule: 'invalid_input' } as const;
export const INVALID_STATE = { ok: false, rule: 'invalid_state' } as const;
export const LIMIT_REACHED = { ok: false, rule: 'limit_reached' } as const;
export const OK = { ok: true } as const;

export const uuid = z.uuid();

export type HubEditor = {
  actorId: string;
  organizationId: string;
  clientId: string;
  /** Room writers publish and ask for approval; freelancers only edit the draft. */
  canPublish: boolean;
};

/**
 * Who edits the client's brand hub: the room writers, and the freelancer of one of the client's
 * projects without publishing ("L E (próprio), sem publicar" in the access matrix).
 */
export async function hubEditor(
  claims: VerifiedClaims,
  clientId: string,
  deps: BrandHubDeps,
): Promise<HubEditor | null> {
  if (claims.user_kind === 'client' || !uuid.safeParse(clientId).success) return null;
  const writer = await roomActor(deps.contexts, claims, clientId, 'write');
  if (writer) {
    return {
      actorId: writer.userId,
      organizationId: writer.organizationId,
      clientId,
      canPublish: true,
    };
  }
  return withActor(
    deps.contexts,
    claims,
    async (tx, actor) => {
      if (actor.mfaVerifiedAt === null) return null;
      const rows = await tx.execute<{ allowed: boolean }>(sql`
        select app.can_edit_brand_hub(${actor.organizationId}::uuid, ${clientId}::uuid) as allowed
      `);
      if (rows[0]?.allowed !== true) return null;
      return {
        actorId: actor.userId,
        organizationId: actor.organizationId,
        clientId,
        canPublish: false,
      };
    },
    null,
  );
}

export type HubTarget = { kind: 'hub' | 'page' | 'block' | 'asset'; id: string };

const TARGET_SQL = {
  hub: sql`select h.id as hub_id, h.client_id from public.brand_hubs h where h.id = `,
  page: sql`select p.hub_id, p.client_id from public.brand_hub_pages p where p.id = `,
  block: sql`select b.hub_id, b.client_id from public.brand_hub_blocks b where b.id = `,
  asset: sql`select a.hub_id, a.client_id from public.brand_hub_assets a where a.id = `,
} as const;

/** The hub a page, block or asset belongs to, and its editor; null when either is missing. */
export async function editableHub(
  claims: VerifiedClaims,
  target: HubTarget,
  deps: BrandHubDeps,
): Promise<{ hubId: string; editor: HubEditor } | null> {
  if (claims.user_kind === 'client' || !uuid.safeParse(target.id).success) return null;
  const [row] = await deps.contexts.withSystemContext((tx) =>
    tx.execute<{ hub_id: string; client_id: string }>(
      sql`${TARGET_SQL[target.kind]}${target.id}::uuid`,
    ),
  );
  if (!row) return null;
  const editor = await hubEditor(claims, row.client_id, deps);
  return editor ? { hubId: row.hub_id, editor } : null;
}

export type LockedHub = {
  id: string;
  organizationId: string;
  clientId: string;
  draftRevision: number;
  publishedPublicationId: string | null;
  publishedRevision: number | null;
  approvedPublicationId: string | null;
};

/**
 * Locks the hub row for the rest of the transaction, so every change to the draft and every
 * publication decides on what is committed now, one request at a time.
 */
export async function lockHub(tx: DbTransaction, hubId: string): Promise<LockedHub | null> {
  const [row] = await tx.execute<{
    id: string;
    organization_id: string;
    client_id: string;
    draft_revision: number;
    published_publication_id: string | null;
    published_revision: number | null;
    approved_publication_id: string | null;
  }>(sql`
    select h.id, h.organization_id, h.client_id, h.draft_revision, h.published_publication_id,
           p.revision as published_revision, h.approved_publication_id
    from public.brand_hubs h
    left join public.brand_hub_publications p on p.id = h.published_publication_id
    where h.id = ${hubId}::uuid
    for update of h
  `);
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    draftRevision: Number(row.draft_revision),
    publishedPublicationId: row.published_publication_id,
    publishedRevision: row.published_revision === null ? null : Number(row.published_revision),
    approvedPublicationId: row.approved_publication_id,
  };
}

/** Marks the draft as changed: a new revision the next publication will carry. */
export async function touchHub(tx: DbTransaction, hubId: string, now: Date): Promise<void> {
  await tx.execute(sql`
    update public.brand_hubs
    set draft_revision = draft_revision + 1, draft_updated_at = ${now.toISOString()}::timestamptz,
        updated_at = ${now.toISOString()}::timestamptz
    where id = ${hubId}::uuid
  `);
}

/**
 * Runs a draft change on the locked hub: `change` returns its result, and the hub's revision rises
 * only when the result is a success.
 */
export async function changeDraft<T extends { ok: boolean }>(
  deps: BrandHubDeps,
  hubId: string,
  change: (tx: DbTransaction, hub: LockedHub) => Promise<T | NotFound>,
): Promise<T | NotFound> {
  const now = (deps.now ?? (() => new Date()))();
  return deps.contexts.withSystemContext(async (tx) => {
    const hub = await lockHub(tx, hubId);
    if (!hub) return NOT_FOUND;
    const result = await change(tx, hub);
    if (result.ok) await touchHub(tx, hubId, now);
    return result;
  });
}
