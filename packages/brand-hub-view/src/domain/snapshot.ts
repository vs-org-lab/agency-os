import { blockAssetIds, type HubBlock } from './blocks';
import type { HubDesign } from './design';

export type BrandHubPageKind = 'standard' | 'custom';

export type BrandHubStandardKey =
  | 'strategy'
  | 'gallery'
  | 'logo'
  | 'typography'
  | 'color'
  | 'photography'
  | 'layout'
  | 'brand_objects'
  | 'resources';

export type HubAsset = { id: string; name: string; mimeType: string; sizeBytes: number };

export type HubSnapshotPage = {
  id: string;
  number: string;
  title: string;
  standardKey: BrandHubStandardKey | null;
  blocks: HubBlock[];
};

/** What a publication freezes, and what the portal and the published site render. */
export type HubSnapshot = { design: HubDesign; pages: HubSnapshotPage[]; assets: HubAsset[] };

export type DraftPage = {
  id: string;
  kind: BrandHubPageKind;
  standardKey: BrandHubStandardKey | null;
  title: string;
  hidden: boolean;
  blocks: HubBlock[];
};

/** The asset ids a page's blocks reference, in order, without repeats. */
export function pageAssetIds(blocks: HubBlock[]): string[] {
  const ids = blocks.flatMap((block) =>
    blockAssetIds(block.type, block.content).map((ref) => ref.assetId),
  );
  return [...new Set(ids)];
}

/** The visible pages in order, numbered, and only the assets those pages use. */
export function buildSnapshot(input: {
  design: HubDesign;
  pages: DraftPage[];
  assets: HubAsset[];
}): HubSnapshot {
  const pages = input.pages
    .filter((page) => !page.hidden)
    .map((page, index) => ({
      id: page.id,
      number: String(index + 1).padStart(2, '0'),
      title: page.title,
      standardKey: page.standardKey,
      blocks: page.blocks,
    }));
  const used = new Set(pages.flatMap((page) => pageAssetIds(page.blocks)));
  return {
    design: input.design,
    pages,
    assets: input.assets.filter((asset) => used.has(asset.id)),
  };
}
