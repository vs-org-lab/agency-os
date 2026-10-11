import { and, asc, count, desc, eq, gt, lt, max } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import type { VerifiedClaims } from '@/platform/db';
import {
  changeDraft,
  editableHub,
  INVALID_INPUT,
  INVALID_STATE,
  LIMIT_REACHED,
  NOT_FOUND,
  OK,
  type BrandHubDeps,
  type NotFound,
} from './access';
import { MAX_HUB_PAGES } from './domain/pages';

const { brandHubPages } = schema;

function pageTitle(title: string): string | null {
  const trimmed = title.trim();
  return trimmed.length >= 1 && trimmed.length <= 80 ? trimmed : null;
}

export async function addHubPage(
  claims: VerifiedClaims,
  input: { hubId: string; title: string },
  deps: BrandHubDeps,
): Promise<{ ok: true; pageId: string } | NotFound | typeof INVALID_INPUT | typeof LIMIT_REACHED> {
  const access = await editableHub(claims, { kind: 'hub', id: input.hubId }, deps);
  if (!access) return NOT_FOUND;
  const title = pageTitle(input.title);
  if (!title) return INVALID_INPUT;
  return changeDraft(deps, access.hubId, async (tx, hub) => {
    const [stats] = await tx
      .select({ pages: count(), last: max(brandHubPages.position) })
      .from(brandHubPages)
      .where(eq(brandHubPages.hubId, hub.id));
    if ((stats?.pages ?? 0) >= MAX_HUB_PAGES) return LIMIT_REACHED;
    const [page] = await tx
      .insert(brandHubPages)
      .values({
        hubId: hub.id,
        organizationId: hub.organizationId,
        clientId: hub.clientId,
        kind: 'custom',
        title,
        position: (stats?.last ?? 0) + 1,
      })
      .returning({ id: brandHubPages.id });
    if (!page) throw new Error('Brand hub page was not added');
    return { ok: true as const, pageId: page.id };
  });
}

export async function renameHubPage(
  claims: VerifiedClaims,
  input: { pageId: string; title: string },
  deps: BrandHubDeps,
): Promise<typeof OK | NotFound | typeof INVALID_INPUT> {
  const access = await editableHub(claims, { kind: 'page', id: input.pageId }, deps);
  if (!access) return NOT_FOUND;
  const title = pageTitle(input.title);
  if (!title) return INVALID_INPUT;
  return changeDraft(deps, access.hubId, async (tx) => {
    await tx.update(brandHubPages).set({ title }).where(eq(brandHubPages.id, input.pageId));
    return OK;
  });
}

export async function setHubPageHidden(
  claims: VerifiedClaims,
  input: { pageId: string; hidden: boolean },
  deps: BrandHubDeps,
): Promise<typeof OK | NotFound> {
  const access = await editableHub(claims, { kind: 'page', id: input.pageId }, deps);
  if (!access) return NOT_FOUND;
  return changeDraft(deps, access.hubId, async (tx) => {
    await tx
      .update(brandHubPages)
      .set({ hidden: input.hidden === true })
      .where(eq(brandHubPages.id, input.pageId));
    return OK;
  });
}

async function swapWithNeighbour(
  tx: DbTransaction,
  hubId: string,
  pageId: string,
  direction: 'up' | 'down',
): Promise<boolean> {
  const [page] = await tx
    .select({ position: brandHubPages.position })
    .from(brandHubPages)
    .where(eq(brandHubPages.id, pageId));
  if (!page) return false;
  const [neighbour] = await tx
    .select({ id: brandHubPages.id, position: brandHubPages.position })
    .from(brandHubPages)
    .where(
      and(
        eq(brandHubPages.hubId, hubId),
        direction === 'up'
          ? lt(brandHubPages.position, page.position)
          : gt(brandHubPages.position, page.position),
      ),
    )
    .orderBy(direction === 'up' ? desc(brandHubPages.position) : asc(brandHubPages.position))
    .limit(1);
  if (!neighbour) return false;
  await tx
    .update(brandHubPages)
    .set({ position: neighbour.position })
    .where(eq(brandHubPages.id, pageId));
  await tx
    .update(brandHubPages)
    .set({ position: page.position })
    .where(eq(brandHubPages.id, neighbour.id));
  return true;
}

export async function moveHubPage(
  claims: VerifiedClaims,
  input: { pageId: string; direction: 'up' | 'down' },
  deps: BrandHubDeps,
): Promise<typeof OK | NotFound | typeof INVALID_STATE> {
  const access = await editableHub(claims, { kind: 'page', id: input.pageId }, deps);
  if (!access || (input.direction !== 'up' && input.direction !== 'down')) return NOT_FOUND;
  return changeDraft(deps, access.hubId, async (tx, hub) =>
    (await swapWithNeighbour(tx, hub.id, input.pageId, input.direction)) ? OK : INVALID_STATE,
  );
}

/** Removes a page of the hub's own; the nine standard pages stay and can only be hidden. */
export async function removeHubPage(
  claims: VerifiedClaims,
  input: { pageId: string },
  deps: BrandHubDeps,
): Promise<typeof OK | NotFound | typeof INVALID_STATE> {
  const access = await editableHub(claims, { kind: 'page', id: input.pageId }, deps);
  if (!access) return NOT_FOUND;
  return changeDraft(deps, access.hubId, async (tx) => {
    const removed = await tx
      .delete(brandHubPages)
      .where(and(eq(brandHubPages.id, input.pageId), eq(brandHubPages.kind, 'custom')))
      .returning({ id: brandHubPages.id });
    return removed.length > 0 ? OK : INVALID_STATE;
  });
}
