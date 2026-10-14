import type { PDFDocument, PDFImage } from 'pdf-lib';
import { CONTENT_WIDTH, createPdf, hexColor, numberPages, type PdfWriter } from '@/platform/pdf';
import type { HubBlock } from './blocks';
import type { HubAsset, HubSnapshot, HubSnapshotPage } from './snapshot';
import { slugify } from './slug';

/** Images embedded in one manual, in bytes; beyond this they appear by name only. */
export const MANUAL_IMAGE_BUDGET_BYTES = 40 * 1024 * 1024;
const IMAGE_MAX_HEIGHT = 320;
const EMBEDDABLE = new Set(['image/jpeg', 'image/png']);
const NOT_EMBEDDED_NOTE = 'Incluído no pacote de downloads';

const STRATEGY_LABELS = [
  ['story', 'História'],
  ['mission', 'Missão'],
  ['vision', 'Visão'],
  ['values', 'Valores'],
  ['voice', 'Voz'],
  ['positioning', 'Posicionamento'],
] as const;

export type ManualImage = { bytes: Uint8Array; mimeType: string };

export type ManualInput = {
  clientName: string;
  publishedAt: Date;
  snapshot: HubSnapshot;
  /** The JPEG and PNG files of the publication, by asset id. */
  images: Map<string, ManualImage>;
  imageBudgetBytes?: number;
};

/** `<client>-manual-de-marca.pdf`, following the download names of RN-82. */
export function manualFileName(clientName: string): string {
  return `${slugify(clientName)}-manual-de-marca.pdf`;
}

const LISBON_DATE = new Intl.DateTimeFormat('pt-PT', {
  timeZone: 'Europe/Lisbon',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function rgbLabel(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `RGB ${(value >> 16) & 0xff}, ${(value >> 8) & 0xff}, ${value & 0xff}`;
}

/** Embeds each image once, within the byte budget; anything else is left to be named. */
class ImageShelf {
  private readonly embedded = new Map<string, PDFImage | null>();
  private spent = 0;

  constructor(
    private readonly document: PDFDocument,
    private readonly images: Map<string, ManualImage>,
    private readonly budget: number,
  ) {}

  async get(assetId: string): Promise<PDFImage | null> {
    if (this.embedded.has(assetId)) return this.embedded.get(assetId) ?? null;
    const image = this.images.get(assetId);
    let result: PDFImage | null = null;
    if (image && EMBEDDABLE.has(image.mimeType) && this.spent + image.bytes.length <= this.budget) {
      try {
        // pdf-lib reads JPEG markers from the start of the underlying buffer, so views into a
        // larger buffer are copied first.
        const bytes = new Uint8Array(image.bytes);
        result =
          image.mimeType === 'image/png'
            ? await this.document.embedPng(bytes)
            : await this.document.embedJpg(bytes);
        this.spent += image.bytes.length;
      } catch {
        result = null;
      }
    }
    this.embedded.set(assetId, result);
    return result;
  }
}

type Context = {
  writer: PdfWriter;
  shelf: ImageShelf;
  assets: Map<string, HubAsset>;
  accent: ReturnType<typeof hexColor>;
};

async function writeImage(context: Context, assetId: string, caption: string): Promise<void> {
  const image = await context.shelf.get(assetId);
  const name = context.assets.get(assetId)?.name ?? assetId;
  if (image) {
    context.writer.picture(image, CONTENT_WIDTH, IMAGE_MAX_HEIGHT);
  } else {
    context.writer.paragraph(name, { bold: true });
    context.writer.paragraph(NOT_EMBEDDED_NOTE, { muted: true, size: 9 });
  }
  if (caption) context.writer.paragraph(caption, { muted: true, size: 9 });
  context.writer.space(8);
}

async function writeBlock(context: Context, block: HubBlock): Promise<void> {
  const { writer } = context;
  switch (block.type) {
    case 'text':
      if (block.content.title) writer.paragraph(block.content.title, { bold: true, size: 12 });
      if (block.content.body) {
        for (const line of block.content.body.split('\n')) writer.paragraph(line || ' ');
      }
      break;
    case 'strategy':
      for (const [key, label] of STRATEGY_LABELS) {
        const value = block.content[key].trim();
        if (!value) continue;
        writer.paragraph(label, { bold: true });
        writer.paragraph(value);
        writer.space(6);
      }
      break;
    case 'image':
      if (block.content.assetId)
        await writeImage(context, block.content.assetId, block.content.caption);
      break;
    case 'logo':
      if (block.content.variant) writer.paragraph(block.content.variant, { bold: true });
      if (block.content.assetId) await writeImage(context, block.content.assetId, '');
      break;
    case 'gallery':
      for (const item of block.content.items) await writeImage(context, item.assetId, item.caption);
      break;
    case 'colors':
      for (const swatch of block.content.swatches) {
        writer.swatch(
          swatch.hex,
          [swatch.name, swatch.hex.toUpperCase(), rgbLabel(swatch.hex), swatch.notes].filter(
            Boolean,
          ),
        );
      }
      break;
    case 'typeface':
      if (block.content.family) writer.paragraph(block.content.family, { bold: true, size: 14 });
      if (block.content.weights.length > 0) {
        writer.paragraph(`Pesos: ${block.content.weights.join(', ')}`, { muted: true });
      }
      if (block.content.sample) writer.paragraph(block.content.sample, { size: 16 });
      if (block.content.assetId) {
        const name = context.assets.get(block.content.assetId)?.name;
        if (name) writer.paragraph(`Ficheiro: ${name}`, { muted: true, size: 9 });
      }
      break;
    case 'downloads':
      writer.paragraph('Ficheiros', { bold: true });
      for (const item of block.content.items) writer.paragraph(`• ${item.label}`);
      break;
  }
  writer.space(12);
}

async function writeSection(context: Context, page: HubSnapshotPage): Promise<void> {
  context.writer.newPage();
  context.writer.paragraph(`${page.number}  ${page.title}`, {
    bold: true,
    size: 20,
    color: context.accent,
  });
  context.writer.space(16);
  for (const block of page.blocks) await writeBlock(context, block);
}

/**
 * The brand manual of a publication (RF-093): a cover, an index and one section per hub page, with
 * colours drawn, JPEG and PNG images embedded and every other file named.
 */
export async function buildManualPdf(input: ManualInput): Promise<Uint8Array> {
  const title = `${input.clientName} · Manual de marca`;
  const { document, fonts, writer } = await createPdf({ title, subject: 'Manual de marca' });
  const accent = hexColor(input.snapshot.design.colors.accent);

  writer.space(220);
  writer.paragraph('Manual de marca', { muted: true, size: 14 });
  writer.space(6);
  writer.paragraph(input.clientName, { bold: true, size: 32, color: accent });
  writer.space(10);
  writer.paragraph(LISBON_DATE.format(input.publishedAt), { muted: true });

  writer.newPage();
  writer.paragraph('Índice', { bold: true, size: 20, color: accent });
  writer.space(16);
  for (const page of input.snapshot.pages) writer.paragraph(`${page.number}  ${page.title}`);

  const context: Context = {
    writer,
    shelf: new ImageShelf(
      document,
      input.images,
      input.imageBudgetBytes ?? MANUAL_IMAGE_BUDGET_BYTES,
    ),
    assets: new Map(input.snapshot.assets.map((asset) => [asset.id, asset])),
    accent,
  };
  for (const page of input.snapshot.pages) await writeSection(context, page);

  numberPages(document, fonts, '{page} / {pages}');
  return document.save();
}
