import { describe, expect, it } from 'vitest';
import { blockAssetIds, blockContentSchema, emptyBlockContent } from './blocks';
import { contrastWarning } from './contrast';
import { DEFAULT_HUB_DESIGN, hubDesignSchema } from './design';
import { downloadEntries } from './downloads';
import { STANDARD_PAGES, starterBlocks } from './pages';
import { buildSnapshot, type HubSnapshot } from './snapshot';

const ASSET = '3f2b8c1e-7d4a-4c6e-9b1a-2e5f8d7c6b4a';
const OTHER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

describe('brand hub domain', () => {
  it('design and block content are validated against the spec limits', () => {
    expect(hubDesignSchema.safeParse(DEFAULT_HUB_DESIGN).success).toBe(true);
    const badHex = {
      ...DEFAULT_HUB_DESIGN,
      colors: { ...DEFAULT_HUB_DESIGN.colors, accent: '#12345' },
    };
    expect(hubDesignSchema.safeParse(badHex).success).toBe(false);
    expect(hubDesignSchema.safeParse({ ...DEFAULT_HUB_DESIGN, layout: 'grid' }).success).toBe(
      false,
    );

    const swatch = { name: 'Azul', hex: '#0A2540', notes: '' };
    expect(blockContentSchema('colors').safeParse({ swatches: [swatch] }).success).toBe(true);
    const tooMany = { swatches: Array.from({ length: 25 }, () => swatch) };
    expect(blockContentSchema('colors').safeParse(tooMany).success).toBe(false);
    expect(
      blockContentSchema('text').safeParse({ title: '', body: 'a'.repeat(5000) }).success,
    ).toBe(true);
    expect(
      blockContentSchema('text').safeParse({ title: '', body: 'a'.repeat(5001) }).success,
    ).toBe(false);
    expect(
      blockContentSchema('logo').safeParse({
        assetId: ASSET,
        variant: 'Principal',
        background: 'red',
      }).success,
    ).toBe(false);
    expect(
      blockContentSchema('gallery').safeParse({
        items: Array.from({ length: 25 }, () => ({ assetId: ASSET, caption: '' })),
      }).success,
    ).toBe(false);
    for (const type of [
      'text',
      'strategy',
      'image',
      'gallery',
      'logo',
      'colors',
      'typeface',
      'downloads',
    ] as const) {
      expect(blockContentSchema(type).safeParse(emptyBlockContent(type)).success).toBe(true);
    }
  });

  it('typeface families are plain names that cannot carry css', () => {
    const typeface = (family: string) => ({ family, weights: [], sample: '', assetId: null });
    expect(blockContentSchema('typeface').safeParse(typeface('Inter Display')).success).toBe(true);
    expect(blockContentSchema('typeface').safeParse(typeface('Söhne Breit-2')).success).toBe(true);
    for (const family of ['x";position:fixed;inset:0', 'a;b', 'url(//evil.tld)', 'a\b']) {
      expect(blockContentSchema('typeface').safeParse(typeface(family)).success).toBe(false);
    }
  });

  it('blocks report the assets they reference and whether they must be images', () => {
    expect(blockAssetIds('logo', { assetId: ASSET, variant: '', background: 'light' })).toEqual([
      { assetId: ASSET, image: false },
    ]);
    expect(
      blockAssetIds('gallery', {
        items: [
          { assetId: ASSET, caption: '' },
          { assetId: OTHER, caption: '' },
        ],
      }),
    ).toEqual([
      { assetId: ASSET, image: true },
      { assetId: OTHER, image: true },
    ]);
    expect(blockAssetIds('image', { assetId: null, caption: '' })).toEqual([]);
    expect(blockAssetIds('text', { title: 'a', body: 'b' })).toEqual([]);
  });

  it('standard pages come in order with starter blocks', () => {
    expect(STANDARD_PAGES.map((page) => page.title)).toEqual([
      'Estratégia',
      'Galeria',
      'Logótipo',
      'Tipografia',
      'Cor',
      'Fotografia',
      'Layout',
      'Objetos de marca',
      'Recursos',
    ]);
    expect(starterBlocks('strategy').map((block) => block.type)).toEqual(['strategy']);
    expect(starterBlocks('logo').map((block) => block.type)).toEqual(['logo']);
    expect(starterBlocks('color').map((block) => block.type)).toEqual(['colors']);
    expect(starterBlocks('typography').map((block) => block.type)).toEqual(['typeface']);
    expect(starterBlocks('gallery').map((block) => block.type)).toEqual(['text']);
  });

  it('snapshots drop hidden pages and unused assets', () => {
    const snapshot = buildSnapshot({
      design: DEFAULT_HUB_DESIGN,
      pages: [
        {
          id: 'p1',
          kind: 'standard',
          standardKey: 'logo',
          title: 'Logótipo',
          hidden: false,
          blocks: [
            {
              id: 'b1',
              type: 'logo',
              content: { assetId: ASSET, variant: 'Principal', background: 'dark' },
            },
          ],
        },
        {
          id: 'p2',
          kind: 'custom',
          standardKey: null,
          title: 'Rascunho',
          hidden: true,
          blocks: [{ id: 'b2', type: 'image', content: { assetId: OTHER, caption: '' } }],
        },
        {
          id: 'p3',
          kind: 'standard',
          standardKey: 'color',
          title: 'Cor',
          hidden: false,
          blocks: [],
        },
      ],
      assets: [
        { id: ASSET, name: 'logo.svg', mimeType: 'image/svg+xml', sizeBytes: 10 },
        { id: OTHER, name: 'foto.png', mimeType: 'image/png', sizeBytes: 20 },
      ],
    });
    expect(snapshot.pages.map((page) => [page.number, page.title])).toEqual([
      ['01', 'Logótipo'],
      ['02', 'Cor'],
    ]);
    expect(snapshot.assets.map((asset) => asset.id)).toEqual([ASSET]);
  });

  it('download names are standardised per page and for all assets', () => {
    const snapshot: HubSnapshot = {
      design: DEFAULT_HUB_DESIGN,
      pages: [
        {
          id: 'p1',
          number: '01',
          title: 'Logótipo',
          standardKey: 'logo',
          blocks: [
            {
              id: 'b1',
              type: 'logo',
              content: { assetId: ASSET, variant: '', background: 'light' },
            },
            {
              id: 'b2',
              type: 'logo',
              content: { assetId: OTHER, variant: '', background: 'dark' },
            },
          ],
        },
        {
          id: 'p2',
          number: '02',
          title: 'Recursos/Extra',
          standardKey: 'resources',
          blocks: [
            {
              id: 'b3',
              type: 'downloads',
              content: { items: [{ assetId: ASSET, label: 'Logótipo' }] },
            },
          ],
        },
      ],
      assets: [
        { id: ASSET, name: 'logo.svg', mimeType: 'image/svg+xml', sizeBytes: 10 },
        { id: OTHER, name: 'logo.svg', mimeType: 'image/svg+xml', sizeBytes: 10 },
      ],
    };
    expect(downloadEntries(snapshot, { clientName: 'Bloom', pageId: 'p1' })).toEqual([
      { assetId: ASSET, path: 'Bloom-Logótipo-logo.svg' },
      { assetId: OTHER, path: 'Bloom-Logótipo-logo (2).svg' },
    ]);
    expect(downloadEntries(snapshot, { clientName: 'Bloom', pageId: null })).toEqual([
      { assetId: ASSET, path: '01 Logótipo/Bloom-Logótipo-logo.svg' },
      { assetId: OTHER, path: '01 Logótipo/Bloom-Logótipo-logo (2).svg' },
      { assetId: ASSET, path: '02 Recursos_Extra/Bloom-Recursos_Extra-logo.svg' },
    ]);
    expect(downloadEntries(snapshot, { clientName: 'Bloom', pageId: 'missing' })).toEqual([]);
  });

  it('low contrast designs are flagged', () => {
    expect(contrastWarning(DEFAULT_HUB_DESIGN)).toBe(false);
    expect(
      contrastWarning({
        ...DEFAULT_HUB_DESIGN,
        colors: { ...DEFAULT_HUB_DESIGN.colors, text: '#BBBBBB' },
      }),
    ).toBe(true);
  });
});
