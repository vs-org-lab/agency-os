import type { BrandHubBlockType, BrandHubStandardKey } from '@agency-os/db';
import { emptyBlockContent, type BlockContent } from './blocks';

export const MAX_HUB_PAGES = 30;
export const MAX_PAGE_BLOCKS = 40;

export const STANDARD_PAGES: readonly { key: BrandHubStandardKey; title: string }[] = [
  { key: 'strategy', title: 'Estratégia' },
  { key: 'gallery', title: 'Galeria' },
  { key: 'logo', title: 'Logótipo' },
  { key: 'typography', title: 'Tipografia' },
  { key: 'color', title: 'Cor' },
  { key: 'photography', title: 'Fotografia' },
  { key: 'layout', title: 'Layout' },
  { key: 'brand_objects', title: 'Objetos de marca' },
  { key: 'resources', title: 'Recursos' },
];

const STARTER_TYPE: Partial<Record<BrandHubStandardKey, BrandHubBlockType>> = {
  strategy: 'strategy',
  logo: 'logo',
  color: 'colors',
  typography: 'typeface',
};

/** The empty blocks a standard page starts with when the hub is created. */
export function starterBlocks(
  key: BrandHubStandardKey,
): { type: BrandHubBlockType; content: BlockContent }[] {
  const type = STARTER_TYPE[key] ?? 'text';
  return [{ type, content: emptyBlockContent(type) }];
}
