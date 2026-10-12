import { z } from 'zod';
import type { BrandHubBlockType } from '@agency-os/db';

const assetRef = z.uuid().nullable();
const text = (max: number) => z.string().max(max);

const strategyField = text(2000);

/** A typeface name only: it ends up in a CSS font-family, so it cannot carry quotes or punctuation. */
const FONT_FAMILY = /^[\p{L}\p{N} ._-]{0,80}$/u;

const schemas = {
  text: z.strictObject({ title: text(120), body: text(5000) }),
  strategy: z.strictObject({
    story: strategyField,
    mission: strategyField,
    vision: strategyField,
    values: strategyField,
    voice: strategyField,
    positioning: strategyField,
  }),
  image: z.strictObject({ assetId: assetRef, caption: text(200) }),
  gallery: z.strictObject({
    items: z.array(z.strictObject({ assetId: z.uuid(), caption: text(200) })).max(24),
  }),
  logo: z.strictObject({
    assetId: assetRef,
    variant: text(80),
    background: z.enum(['light', 'dark', 'accent']),
  }),
  colors: z.strictObject({
    swatches: z
      .array(
        z.strictObject({
          name: z.string().min(1).max(40),
          hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
          notes: text(80),
        }),
      )
      .max(24),
  }),
  typeface: z.strictObject({
    family: z.string().regex(FONT_FAMILY),
    weights: z.array(z.string().min(1).max(40)).max(10),
    sample: text(200),
    assetId: assetRef,
  }),
  downloads: z.strictObject({
    items: z.array(z.strictObject({ assetId: z.uuid(), label: z.string().min(1).max(80) })).max(50),
  }),
} satisfies Record<BrandHubBlockType, z.ZodType>;

export type BlockContentMap = { [K in BrandHubBlockType]: z.infer<(typeof schemas)[K]> };
export type BlockContent<T extends BrandHubBlockType = BrandHubBlockType> = BlockContentMap[T];

/** A block as stored and published: its type with matching content. */
export type HubBlock = {
  [K in BrandHubBlockType]: { id: string; type: K; content: BlockContentMap[K] };
}[BrandHubBlockType];

export function blockContentSchema<T extends BrandHubBlockType>(
  type: T,
): z.ZodType<BlockContent<T>> {
  return schemas[type] as unknown as z.ZodType<BlockContent<T>>;
}

const EMPTY: BlockContentMap = {
  text: { title: '', body: '' },
  strategy: { story: '', mission: '', vision: '', values: '', voice: '', positioning: '' },
  image: { assetId: null, caption: '' },
  gallery: { items: [] },
  logo: { assetId: null, variant: '', background: 'light' },
  colors: { swatches: [] },
  typeface: { family: '', weights: [], sample: '', assetId: null },
  downloads: { items: [] },
};

export function emptyBlockContent<T extends BrandHubBlockType>(type: T): BlockContent<T> {
  return structuredClone(EMPTY[type]);
}

/** The hub assets a block references, and whether each must be an image. */
export function blockAssetIds(
  type: BrandHubBlockType,
  content: unknown,
): { assetId: string; image: boolean }[] {
  const block = { type, content } as HubBlock;
  switch (block.type) {
    case 'image':
      return block.content.assetId ? [{ assetId: block.content.assetId, image: true }] : [];
    case 'gallery':
      return block.content.items.map((item) => ({ assetId: item.assetId, image: true }));
    case 'logo':
    case 'typeface':
      return block.content.assetId ? [{ assetId: block.content.assetId, image: false }] : [];
    case 'downloads':
      return block.content.items.map((item) => ({ assetId: item.assetId, image: false }));
    default:
      return [];
  }
}

/** The content with every reference to `assetId` dropped, for when the asset is removed. */
export function withoutAsset(type: BrandHubBlockType, content: unknown, assetId: string): unknown {
  const block = { type, content } as HubBlock;
  switch (block.type) {
    case 'image':
    case 'logo':
    case 'typeface':
      return block.content.assetId === assetId ? { ...block.content, assetId: null } : content;
    case 'gallery':
    case 'downloads':
      return {
        ...block.content,
        items: (block.content.items as { assetId: string }[]).filter(
          (item) => item.assetId !== assetId,
        ),
      };
    default:
      return content;
  }
}
