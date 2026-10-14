import { crc32, deflateSync } from 'node:zlib';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { pdfContainsText } from '@/platform/pdf-testing';
import { DEFAULT_HUB_DESIGN } from './design';
import { buildManualPdf, manualFileName, type ManualImage } from './manual-pdf';
import type { HubSnapshot } from './snapshot';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG_1X1 = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

/** A valid greyscale PNG of the given size; blank rows compress to a few kilobytes. */
function blankPng(width: number, height: number): Uint8Array {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 0, 0, 0, 0], 8);
  const rows = Buffer.alloc((width + 1) * height);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const LOGO = '00000000-0000-4000-8000-000000000001';
const PHOTO = '00000000-0000-4000-8000-000000000002';
const WEBP = '00000000-0000-4000-8000-000000000003';
const SVG = '00000000-0000-4000-8000-000000000004';
const BROKEN = '00000000-0000-4000-8000-000000000005';

const SNAPSHOT: HubSnapshot = {
  design: { ...DEFAULT_HUB_DESIGN, colors: { ...DEFAULT_HUB_DESIGN.colors, accent: '#B4532A' } },
  assets: [
    { id: LOGO, name: 'logotipo.png', mimeType: 'image/png', sizeBytes: PNG_1X1.length },
    { id: PHOTO, name: 'equipa.jpg', mimeType: 'image/jpeg', sizeBytes: JPEG_1X1.length },
    { id: WEBP, name: 'campanha.webp', mimeType: 'image/webp', sizeBytes: 10 },
    { id: SVG, name: 'simbolo.svg', mimeType: 'image/svg+xml', sizeBytes: 10 },
    { id: BROKEN, name: 'estragada.png', mimeType: 'image/png', sizeBytes: 4 },
  ],
  pages: [
    {
      id: 'p1',
      number: '01',
      title: 'Estratégia',
      standardKey: 'strategy',
      blocks: [
        {
          id: 'b1',
          type: 'strategy',
          content: {
            story: 'Nascemos na Ação.',
            mission: 'Missão com coração',
            vision: '',
            values: '',
            voice: '',
            positioning: '',
          },
        },
        { id: 'b2', type: 'text', content: { title: 'Nota', body: 'Texto livre' } },
      ],
    },
    {
      id: 'p2',
      number: '02',
      title: 'Logótipo',
      standardKey: 'logo',
      blocks: [
        {
          id: 'b3',
          type: 'logo',
          content: { assetId: LOGO, variant: 'Principal', background: 'light' },
        },
        {
          id: 'b4',
          type: 'gallery',
          content: {
            items: [
              { assetId: PHOTO, caption: 'Equipa' },
              { assetId: WEBP, caption: '' },
              { assetId: SVG, caption: '' },
              { assetId: BROKEN, caption: '' },
            ],
          },
        },
      ],
    },
    {
      id: 'p3',
      number: '03',
      title: 'Cor',
      standardKey: 'color',
      blocks: [
        {
          id: 'b5',
          type: 'colors',
          content: { swatches: [{ name: 'Terracota', hex: '#B4532A', notes: 'Principal' }] },
        },
        {
          id: 'b6',
          type: 'typeface',
          content: { family: 'Fraunces', weights: ['400', '700'], sample: 'Olá', assetId: null },
        },
        {
          id: 'b7',
          type: 'downloads',
          content: { items: [{ assetId: SVG, label: 'Símbolo em SVG' }] },
        },
      ],
    },
  ],
};

function images(): Map<string, ManualImage> {
  return new Map([
    [LOGO, { bytes: PNG_1X1, mimeType: 'image/png' }],
    [PHOTO, { bytes: JPEG_1X1, mimeType: 'image/jpeg' }],
    [BROKEN, { bytes: new Uint8Array([1, 2, 3, 4]), mimeType: 'image/png' }],
  ]);
}

const INPUT = {
  clientName: 'Atlas Cerâmica',
  publishedAt: new Date('2026-10-12T09:00:00Z'),
  snapshot: SNAPSHOT,
};

describe('buildManualPdf', () => {
  it('the manual has a cover, an index and one section per page', async () => {
    const pdf = await buildManualPdf({ ...INPUT, images: images() });
    const document = await PDFDocument.load(pdf);
    expect(document.getPageCount()).toBeGreaterThanOrEqual(5);
    expect(document.getTitle()).toBe('Atlas Cerâmica · Manual de marca');
    for (const text of ['Manual de marca', 'Atlas Cerâmica', '12/10/2026', 'Índice']) {
      expect(pdfContainsText(pdf, text), text).toBe(true);
    }
    for (const text of ['01  Estratégia', '02  Logótipo', '03  Cor']) {
      expect(pdfContainsText(pdf, text), text).toBe(true);
    }
    for (const text of [
      'Missão',
      'Missão com coração',
      'Terracota',
      '#B4532A',
      'RGB 180, 83, 42',
    ]) {
      expect(pdfContainsText(pdf, text), text).toBe(true);
    }
    expect(pdfContainsText(pdf, 'Fraunces')).toBe(true);
    expect(pdfContainsText(pdf, 'Símbolo em SVG')).toBe(true);
  });

  it('jpeg and png images are embedded', async () => {
    const pdf = await buildManualPdf({ ...INPUT, images: images() });
    const document = await PDFDocument.load(pdf);
    const filters = document.context
      .enumerateIndirectObjects()
      .map(([, object]) => object)
      .filter((object): object is PDFRawStream => object instanceof PDFRawStream)
      .filter((stream) => stream.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'))
      .map((stream) => String(stream.dict.get(PDFName.of('Filter'))));
    expect(filters).toContain('/DCTDecode');
    expect(filters).toContain('/FlateDecode');
  });

  it('unsupported and oversized images are listed by name', async () => {
    const pdf = await buildManualPdf({
      ...INPUT,
      images: images(),
      imageBudgetBytes: PNG_1X1.length,
    });
    for (const name of ['campanha.webp', 'simbolo.svg', 'estragada.png', 'equipa.jpg']) {
      expect(pdfContainsText(pdf, name), name).toBe(true);
    }
    expect(pdfContainsText(pdf, 'Incluído no pacote de downloads')).toBe(true);
    expect(pdfContainsText(pdf, 'logotipo.png')).toBe(false);
  });

  it('images with too many pixels are listed by name, however small the file', async () => {
    const pdf = await buildManualPdf({
      ...INPUT,
      images: new Map([[LOGO, { bytes: blankPng(5000, 4000), mimeType: 'image/png' }]]),
    });
    expect(pdfContainsText(pdf, 'logotipo.png')).toBe(true);
    const document = await PDFDocument.load(pdf);
    const images = document.context
      .enumerateIndirectObjects()
      .filter(
        ([, object]) =>
          object instanceof PDFRawStream &&
          object.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'),
      );
    expect(images).toHaveLength(0);
  });

  it('portuguese text is kept', async () => {
    const pdf = await buildManualPdf({ ...INPUT, images: new Map() });
    for (const text of ['Nascemos na Ação.', 'Olá', 'Cerâmica']) {
      expect(pdfContainsText(pdf, text), text).toBe(true);
    }
  });

  it('names the file after the client', () => {
    expect(manualFileName('Atlas Cerâmica, Lda.')).toBe('atlas-ceramica-lda-manual-de-marca.pdf');
  });
});
