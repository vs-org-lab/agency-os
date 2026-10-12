import { and, asc, count, desc, eq, gt, inArray, isNull, lt, max } from 'drizzle-orm';
import { schema, type BrandHubBlockType, type DbTransaction } from '@agency-os/db';
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
import { blockAssetIds, blockContentSchema, emptyBlockContent } from './domain/blocks';
import { MAX_PAGE_BLOCKS } from './domain/pages';

const { brandHubAssets, brandHubBlocks } = schema;

const BLOCK_TYPES = new Set<string>(brandHubBlocks.type.enumValues);

/** Whether every asset the content references is a ready, active asset of the hub (SEC-41). */
async function referencesAreValid(
  tx: DbTransaction,
  hubId: string,
  refs: { assetId: string; image: boolean }[],
): Promise<boolean> {
  if (refs.length === 0) return true;
  const rows = await tx
    .select({ id: brandHubAssets.id, mimeType: brandHubAssets.mimeType })
    .from(brandHubAssets)
    .where(
      and(
        eq(brandHubAssets.hubId, hubId),
        eq(brandHubAssets.uploadStatus, 'ready'),
        isNull(brandHubAssets.removedAt),
        inArray(
          brandHubAssets.id,
          refs.map((ref) => ref.assetId),
        ),
      ),
    );
  const assets = new Map(rows.map((row) => [row.id, row.mimeType ?? '']));
  return refs.every((ref) => {
    const mimeType = assets.get(ref.assetId);
    return mimeType !== undefined && (!ref.image || mimeType.startsWith('image/'));
  });
}

export async function addHubBlock(
  claims: VerifiedClaims,
  input: { pageId: string; type: BrandHubBlockType },
  deps: BrandHubDeps,
): Promise<{ ok: true; blockId: string } | NotFound | typeof INVALID_INPUT | typeof LIMIT_REACHED> {
  const access = await editableHub(claims, { kind: 'page', id: input.pageId }, deps);
  if (!access) return NOT_FOUND;
  if (!BLOCK_TYPES.has(input.type)) return INVALID_INPUT;
  return changeDraft(deps, access.hubId, async (tx, hub) => {
    const [stats] = await tx
      .select({ blocks: count(), last: max(brandHubBlocks.position) })
      .from(brandHubBlocks)
      .where(eq(brandHubBlocks.pageId, input.pageId));
    if ((stats?.blocks ?? 0) >= MAX_PAGE_BLOCKS) return LIMIT_REACHED;
    const [block] = await tx
      .insert(brandHubBlocks)
      .values({
        pageId: input.pageId,
        hubId: hub.id,
        organizationId: hub.organizationId,
        clientId: hub.clientId,
        type: input.type,
        position: (stats?.last ?? 0) + 1,
        content: emptyBlockContent(input.type),
      })
      .returning({ id: brandHubBlocks.id });
    if (!block) throw new Error('Brand hub block was not added');
    return { ok: true as const, blockId: block.id };
  });
}

/** Replaces a block's content after validating it and every asset it references. */
export async function updateHubBlock(
  claims: VerifiedClaims,
  input: { blockId: string; content: unknown },
  deps: BrandHubDeps,
): Promise<typeof OK | NotFound | typeof INVALID_INPUT> {
  const access = await editableHub(claims, { kind: 'block', id: input.blockId }, deps);
  if (!access) return NOT_FOUND;
  return changeDraft(deps, access.hubId, async (tx, hub) => {
    const [block] = await tx
      .select({ type: brandHubBlocks.type })
      .from(brandHubBlocks)
      .where(eq(brandHubBlocks.id, input.blockId));
    if (!block) return NOT_FOUND;
    const content = blockContentSchema(block.type).safeParse(input.content);
    if (!content.success) return INVALID_INPUT;
    if (!(await referencesAreValid(tx, hub.id, blockAssetIds(block.type, content.data)))) {
      return INVALID_INPUT;
    }
    await tx
      .update(brandHubBlocks)
      .set({ content: content.data })
      .where(eq(brandHubBlocks.id, input.blockId));
    return OK;
  });
}

export async function moveHubBlock(
  claims: VerifiedClaims,
  input: { blockId: string; direction: 'up' | 'down' },
  deps: BrandHubDeps,
): Promise<typeof OK | NotFound | typeof INVALID_STATE> {
  const access = await editableHub(claims, { kind: 'block', id: input.blockId }, deps);
  if (!access || (input.direction !== 'up' && input.direction !== 'down')) return NOT_FOUND;
  return changeDraft(deps, access.hubId, async (tx) => {
    const [block] = await tx
      .select({ pageId: brandHubBlocks.pageId, position: brandHubBlocks.position })
      .from(brandHubBlocks)
      .where(eq(brandHubBlocks.id, input.blockId));
    if (!block) return NOT_FOUND;
    const up = input.direction === 'up';
    const [neighbour] = await tx
      .select({ id: brandHubBlocks.id, position: brandHubBlocks.position })
      .from(brandHubBlocks)
      .where(
        and(
          eq(brandHubBlocks.pageId, block.pageId),
          up
            ? lt(brandHubBlocks.position, block.position)
            : gt(brandHubBlocks.position, block.position),
        ),
      )
      .orderBy(up ? desc(brandHubBlocks.position) : asc(brandHubBlocks.position))
      .limit(1);
    if (!neighbour) return INVALID_STATE;
    await tx
      .update(brandHubBlocks)
      .set({ position: neighbour.position })
      .where(eq(brandHubBlocks.id, input.blockId));
    await tx
      .update(brandHubBlocks)
      .set({ position: block.position })
      .where(eq(brandHubBlocks.id, neighbour.id));
    return OK;
  });
}

export async function removeHubBlock(
  claims: VerifiedClaims,
  input: { blockId: string },
  deps: BrandHubDeps,
): Promise<typeof OK | NotFound> {
  const access = await editableHub(claims, { kind: 'block', id: input.blockId }, deps);
  if (!access) return NOT_FOUND;
  return changeDraft(deps, access.hubId, async (tx) => {
    await tx.delete(brandHubBlocks).where(eq(brandHubBlocks.id, input.blockId));
    return OK;
  });
}
