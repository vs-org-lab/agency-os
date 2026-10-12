import { and, asc, eq, isNull } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import type { HubBlock } from './domain/blocks';
import { DEFAULT_HUB_DESIGN, hubDesignSchema, type HubDesign } from './domain/design';
import type { DraftPage, HubAsset } from './domain/snapshot';

const { brandHubAssets, brandHubBlocks, brandHubPages, brandHubs } = schema;

export type HubDraft = {
  design: HubDesign;
  pages: (DraftPage & { position: number })[];
  assets: (HubAsset & { status: 'uploading' | 'ready' | 'rejected' })[];
};

/** The hub's draft as stored: design, pages in order with their blocks, and its active assets. */
export async function readDraft(tx: DbTransaction, hubId: string): Promise<HubDraft | null> {
  const [hub] = await tx
    .select({ design: brandHubs.design })
    .from(brandHubs)
    .where(eq(brandHubs.id, hubId));
  if (!hub) return null;
  const pages = await tx
    .select({
      id: brandHubPages.id,
      kind: brandHubPages.kind,
      standardKey: brandHubPages.standardKey,
      title: brandHubPages.title,
      hidden: brandHubPages.hidden,
      position: brandHubPages.position,
    })
    .from(brandHubPages)
    .where(eq(brandHubPages.hubId, hubId))
    .orderBy(asc(brandHubPages.position));
  const blocks = await tx
    .select({
      id: brandHubBlocks.id,
      pageId: brandHubBlocks.pageId,
      type: brandHubBlocks.type,
      content: brandHubBlocks.content,
    })
    .from(brandHubBlocks)
    .where(eq(brandHubBlocks.hubId, hubId))
    .orderBy(asc(brandHubBlocks.position));
  const assets = await tx
    .select({
      id: brandHubAssets.id,
      name: brandHubAssets.name,
      mimeType: brandHubAssets.mimeType,
      sizeBytes: brandHubAssets.sizeBytes,
      status: brandHubAssets.uploadStatus,
    })
    .from(brandHubAssets)
    .where(and(eq(brandHubAssets.hubId, hubId), isNull(brandHubAssets.removedAt)))
    .orderBy(asc(brandHubAssets.createdAt));
  const design = hubDesignSchema.safeParse(hub.design);
  return {
    design: design.success ? design.data : DEFAULT_HUB_DESIGN,
    pages: pages.map((page) => ({
      ...page,
      blocks: blocks
        .filter((block) => block.pageId === page.id)
        .map((block) => ({ id: block.id, type: block.type, content: block.content }) as HubBlock),
    })),
    assets: assets.map((asset) => ({ ...asset, mimeType: asset.mimeType ?? '' })),
  };
}
