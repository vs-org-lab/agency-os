import {
  PDFDocument,
  StandardFonts,
  rgb,
  setCharacterSpacing,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from 'pdf-lib';

export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;
export const MARGIN = 56;
export const BODY_SIZE = 10.5;
const LINE_GAP = 4;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
/** Aurion Ink and Gold, from the brand templates. */
const TEXT_COLOR = rgb(11 / 255, 17 / 255, 23 / 255);
const MUTED_COLOR = rgb(0.4, 0.4, 0.4);
const RULE_COLOR = rgb(0.85, 0.86, 0.87);
const GOLD_COLOR = rgb(217 / 255, 164 / 255, 65 / 255);
const EYEBROW_SIZE = 8;
const EYEBROW_SPACING = 1.6;
const TITLE_SIZE = 26;
const SWATCH_SIZE = 48;
const SWATCH_GAP = 14;

export type PdfFonts = { regular: PDFFont; bold: PDFFont; serif: PDFFont; mono: PDFFont };

async function embedFonts(document: PDFDocument): Promise<PdfFonts> {
  return {
    regular: await document.embedFont(StandardFonts.Helvetica),
    bold: await document.embedFont(StandardFonts.HelveticaBold),
    serif: await document.embedFont(StandardFonts.TimesRoman),
    mono: await document.embedFont(StandardFonts.Courier),
  };
}

export type ParagraphOptions = {
  size?: number;
  bold?: boolean;
  muted?: boolean;
  indent?: number;
  color?: RGB;
  font?: PDFFont;
};

/** `#RRGGBB` as pdf-lib colour components. */
export function hexColor(hex: string): RGB {
  const value = Number.parseInt(hex.slice(1), 16);
  return rgb(((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255);
}

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

/** A word wider than the line (a long link) in pieces that each fit it. */
function splitWord(font: PDFFont, word: string, size: number, width: number): string[] {
  const pieces: string[] = [];
  let piece = '';
  for (const character of word) {
    if (piece && font.widthOfTextAtSize(piece + character, size) > width) {
      pieces.push(piece);
      piece = '';
    }
    piece += character;
  }
  pieces.push(piece);
  return pieces;
}

export function wrapText(font: PDFFont, text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  const words = text
    .split(' ')
    .flatMap((word) =>
      font.widthOfTextAtSize(word, size) > width ? splitWord(font, word, size, width) : [word],
    );
  for (const word of words) {
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
    const font = options.font ?? (options.bold ? this.fonts.bold : this.fonts.regular);
    const size = options.size ?? BODY_SIZE;
    const indent = options.indent ?? 0;
    for (const line of wrapText(font, encodable(font, text), size, CONTENT_WIDTH - indent)) {
      if (this.y - size < MARGIN) this.newPage();
      this.y -= size;
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.y,
        size,
        font,
        color: options.color ?? (options.muted ? MUTED_COLOR : TEXT_COLOR),
      });
      this.y -= LINE_GAP;
    }
  }

  /** The brand's spaced, gold, upper-case label above a title. */
  eyebrow(text: string): void {
    const font = this.fonts.mono;
    if (this.y - EYEBROW_SIZE < MARGIN) this.newPage();
    this.y -= EYEBROW_SIZE;
    this.page.pushOperators(setCharacterSpacing(EYEBROW_SPACING));
    this.page.drawText(encodable(font, text.toLocaleUpperCase('pt-PT')), {
      x: MARGIN,
      y: this.y,
      size: EYEBROW_SIZE,
      font,
      color: GOLD_COLOR,
    });
    this.page.pushOperators(setCharacterSpacing(0));
    this.y -= LINE_GAP * 3;
  }

  /** A document title in the brand's serif. */
  title(text: string, size = TITLE_SIZE): void {
    this.paragraph(text, { size, font: this.fonts.serif });
    this.y -= LINE_GAP;
  }

  /** A hairline across the content width. */
  rule(): void {
    this.y -= LINE_GAP * 2;
    if (this.y < MARGIN) this.newPage();
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 0.5,
      color: RULE_COLOR,
    });
    this.y -= LINE_GAP * 4;
  }

  async image(png: Uint8Array, size: number): Promise<void> {
    const embedded = await this.document.embedPng(png);
    if (this.y - size < MARGIN) this.newPage();
    this.y -= size;
    this.page.drawImage(embedded, { x: MARGIN, y: this.y, width: size, height: size });
    this.y -= LINE_GAP;
  }

  /** An embedded image scaled to fit the width and height given, keeping its proportions. */
  picture(image: PDFImage, maxWidth: number, maxHeight: number): void {
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const width = image.width * scale;
    const height = image.height * scale;
    if (this.y - height < MARGIN) this.newPage();
    this.y -= height;
    this.page.drawImage(image, { x: MARGIN, y: this.y, width, height });
    this.y -= LINE_GAP;
  }

  /** A colour sample with its lines of description beside it. */
  swatch(hex: string, lines: string[]): void {
    if (this.y - SWATCH_SIZE < MARGIN) this.newPage();
    const top = this.y;
    this.page.drawRectangle({
      x: MARGIN,
      y: top - SWATCH_SIZE,
      width: SWATCH_SIZE,
      height: SWATCH_SIZE,
      color: hexColor(hex),
      borderColor: MUTED_COLOR,
      borderWidth: 0.5,
    });
    lines.forEach((line, index) => {
      const font = index === 0 ? this.fonts.bold : this.fonts.regular;
      this.page.drawText(encodable(font, line), {
        x: MARGIN + SWATCH_SIZE + SWATCH_GAP,
        y: top - BODY_SIZE - index * (BODY_SIZE + LINE_GAP),
        size: BODY_SIZE,
        font,
        color: index === 0 ? TEXT_COLOR : MUTED_COLOR,
      });
    });
    this.y = top - SWATCH_SIZE - SWATCH_GAP;
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
  const fonts = await embedFonts(document);
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

const SLIDE_TITLE_SIZE = 22;
const SLIDE_BODY_SIZE = 14;
const SLIDE_LINE_GAP = 6;
const SLIDE_WIDTH = PAGE_HEIGHT;
const SLIDE_HEIGHT = PAGE_WIDTH;
const SLIDE_CONTENT_WIDTH = SLIDE_WIDTH - MARGIN * 2;

/**
 * Writes a deck of A4 landscape slides: each slide has a title, and content that does not fit
 * continues on a new slide under the same title marked "(cont.)".
 */
export class SlideWriter {
  private page: PDFPage | null = null;
  private y = 0;
  private title = '';

  constructor(
    private readonly document: PDFDocument,
    private readonly fonts: PdfFonts,
  ) {}

  private draw(text: string, size: number, bold: boolean, indent: number, muted = false): void {
    const font = bold ? this.fonts.bold : this.fonts.regular;
    for (const line of wrapText(font, encodable(font, text), size, SLIDE_CONTENT_WIDTH - indent)) {
      if (!this.page || this.y - size < MARGIN) this.continueSlide();
      this.y -= size;
      this.page?.drawText(line, {
        x: MARGIN + indent,
        y: this.y,
        size,
        font,
        color: muted ? MUTED_COLOR : TEXT_COLOR,
      });
      this.y -= SLIDE_LINE_GAP;
    }
  }

  private open(heading: string): void {
    this.page = this.document.addPage([SLIDE_WIDTH, SLIDE_HEIGHT]);
    this.y = SLIDE_HEIGHT - MARGIN;
    const font = this.fonts.bold;
    for (const line of wrapText(
      font,
      encodable(font, heading),
      SLIDE_TITLE_SIZE,
      SLIDE_CONTENT_WIDTH,
    )) {
      this.y -= SLIDE_TITLE_SIZE;
      this.page.drawText(line, {
        x: MARGIN,
        y: this.y,
        size: SLIDE_TITLE_SIZE,
        font,
        color: TEXT_COLOR,
      });
      this.y -= SLIDE_LINE_GAP;
    }
    this.y -= SLIDE_BODY_SIZE;
  }

  private continueSlide(): void {
    this.open(`${this.title} (cont.)`);
  }

  /** A cover slide: the title centred in the upper half and a muted line below it. */
  cover(title: string, subtitle: string): void {
    this.title = title;
    this.page = this.document.addPage([SLIDE_WIDTH, SLIDE_HEIGHT]);
    this.y = SLIDE_HEIGHT / 2 + SLIDE_TITLE_SIZE * 2;
    this.draw(title, SLIDE_TITLE_SIZE + 6, true, 0);
    this.y -= SLIDE_LINE_GAP;
    this.draw(subtitle, SLIDE_BODY_SIZE, false, 0, true);
  }

  slide(title: string): void {
    this.title = title;
    this.open(title);
  }

  heading(text: string): void {
    this.draw(text, SLIDE_BODY_SIZE, true, 0);
  }

  bullet(text: string): void {
    this.draw(`•  ${text}`, SLIDE_BODY_SIZE, false, 12);
  }

  paragraph(text: string): void {
    for (const block of text.split(/\n+/)) this.draw(block, SLIDE_BODY_SIZE, false, 0);
  }
}

export async function createDeck(meta: { title: string }): Promise<{
  document: PDFDocument;
  slides: SlideWriter;
}> {
  const document = await PDFDocument.create();
  document.setTitle(meta.title);
  document.setProducer('Agency OS');
  const fonts = await embedFonts(document);
  return { document, slides: new SlideWriter(document, fonts) };
}
