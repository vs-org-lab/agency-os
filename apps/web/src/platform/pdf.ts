import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;
export const MARGIN = 56;
export const BODY_SIZE = 10.5;
const LINE_GAP = 4;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const TEXT_COLOR = rgb(0.1, 0.1, 0.1);
const MUTED_COLOR = rgb(0.4, 0.4, 0.4);

export type PdfFonts = { regular: PDFFont; bold: PDFFont };

export type ParagraphOptions = { size?: number; bold?: boolean; muted?: boolean; indent?: number };

/** Keeps only characters the standard WinAnsi fonts can encode. */
export function encodable(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet());
  return [...text.replace(/[\u00a0\u2009\u202f]/g, ' ')]
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      if (supported.has(code)) return character;
      if (character === '\u2192') return '->';
      return '?';
    })
    .join('');
}

function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width || line === '') {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines;
}

/** Writes flowing text top to bottom on A4 pages, adding pages as the content grows. */
export class PdfWriter {
  private page: PDFPage;
  private y = PAGE_HEIGHT - MARGIN;

  constructor(
    private readonly document: PDFDocument,
    private readonly fonts: PdfFonts,
  ) {
    this.page = this.addPage();
  }

  private addPage(): PDFPage {
    const page = this.document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
    return page;
  }

  newPage(): void {
    this.page = this.addPage();
  }

  space(points: number): void {
    this.y -= points;
  }

  paragraph(text: string, options: ParagraphOptions = {}): void {
    const font = options.bold ? this.fonts.bold : this.fonts.regular;
    const size = options.size ?? BODY_SIZE;
    const indent = options.indent ?? 0;
    for (const line of wrap(font, encodable(font, text), size, CONTENT_WIDTH - indent)) {
      if (this.y - size < MARGIN) this.newPage();
      this.y -= size;
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.y,
        size,
        font,
        color: options.muted ? MUTED_COLOR : TEXT_COLOR,
      });
      this.y -= LINE_GAP;
    }
  }

  async image(png: Uint8Array, size: number): Promise<void> {
    const embedded = await this.document.embedPng(png);
    if (this.y - size < MARGIN) this.newPage();
    this.y -= size;
    this.page.drawImage(embedded, { x: MARGIN, y: this.y, width: size, height: size });
    this.y -= LINE_GAP;
  }
}

export async function createPdf(meta: { title: string; subject?: string }): Promise<{
  document: PDFDocument;
  fonts: PdfFonts;
  writer: PdfWriter;
}> {
  const document = await PDFDocument.create();
  document.setTitle(meta.title);
  if (meta.subject) document.setSubject(meta.subject);
  document.setProducer('Agency OS');
  const fonts: PdfFonts = {
    regular: await document.embedFont(StandardFonts.Helvetica),
    bold: await document.embedFont(StandardFonts.HelveticaBold),
  };
  return { document, fonts, writer: new PdfWriter(document, fonts) };
}

/** Stamps "{page} of {pages}" in the bottom right corner of every page. */
export function numberPages(document: PDFDocument, fonts: PdfFonts, template: string): void {
  const pages = document.getPages();
  pages.forEach((page, index) => {
    const label = encodable(
      fonts.regular,
      template.replace('{page}', String(index + 1)).replace('{pages}', String(pages.length)),
    );
    page.drawText(label, {
      x: PAGE_WIDTH - MARGIN - fonts.regular.widthOfTextAtSize(label, 8),
      y: MARGIN / 2,
      size: 8,
      font: fonts.regular,
      color: MUTED_COLOR,
    });
  });
}
