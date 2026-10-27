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

const SLIDE_WIDTH = 960;
const SLIDE_HEIGHT = 540;
const SLIDE_MARGIN = 64;
const SLIDE_CONTENT_WIDTH = SLIDE_WIDTH - SLIDE_MARGIN * 2;
const SLIDE_TITLE_SIZE = 30;
const SLIDE_SUBTITLE_SIZE = 13;
const SLIDE_BODY_SIZE = 14;
const SLIDE_LINE_GAP = 7;
const INK_COLOR = rgb(0, 13 / 255, 23 / 255);
const ON_INK_MUTED = rgb(154 / 255, 167 / 255, 180 / 255);
const WHITE = rgb(1, 1, 1);
const BAR_PREVIOUS = rgb(0.78, 0.8, 0.82);

export type SlideMetric = { value: string; label: string; note: string };

export type SlideComparison = {
  label: string;
  previous: number | null;
  current: number | null;
  previousText: string;
  currentText: string;
  change: string;
};

type TextOptions = {
  x: number;
  y: number;
  size: number;
  font: PDFFont;
  color: RGB;
  spacing?: number;
};

/**
 * Writes a 16:9 deck in the brand template: Ink cover and closing, gold mono eyebrows, serif
 * titles. Content that does not fit continues on a new slide under the same title marked "(cont.)".
 */
export class SlideWriter {
  private page: PDFPage | null = null;
  private y = 0;
  private title = '';

  constructor(
    private readonly document: PDFDocument,
    private readonly fonts: PdfFonts,
  ) {}

  private text(value: string, options: TextOptions): void {
    if (!this.page) return;
    if (options.spacing) this.page.pushOperators(setCharacterSpacing(options.spacing));
    this.page.drawText(encodable(options.font, value), {
      x: options.x,
      y: options.y,
      size: options.size,
      font: options.font,
      color: options.color,
    });
    if (options.spacing) this.page.pushOperators(setCharacterSpacing(0));
  }

  private eyebrowAt(value: string, x: number, y: number): void {
    this.text(value.toLocaleUpperCase('pt-PT'), {
      x,
      y,
      size: EYEBROW_SIZE,
      font: this.fonts.mono,
      color: GOLD_COLOR,
      spacing: EYEBROW_SPACING,
    });
  }

  private draw(value: string, size: number, font: PDFFont, indent: number): void {
    for (const line of wrapText(font, encodable(font, value), size, SLIDE_CONTENT_WIDTH - indent)) {
      if (!this.page || this.y - size < SLIDE_MARGIN) this.continueSlide();
      this.y -= size;
      this.text(line, { x: SLIDE_MARGIN + indent, y: this.y, size, font, color: TEXT_COLOR });
      this.y -= SLIDE_LINE_GAP;
    }
  }

  private inkPage(): PDFPage {
    const page = this.document.addPage([SLIDE_WIDTH, SLIDE_HEIGHT]);
    page.drawRectangle({ x: 0, y: 0, width: SLIDE_WIDTH, height: SLIDE_HEIGHT, color: INK_COLOR });
    return page;
  }

  private open(heading: string, subtitle?: string): void {
    this.page = this.document.addPage([SLIDE_WIDTH, SLIDE_HEIGHT]);
    this.y = SLIDE_HEIGHT - SLIDE_MARGIN;
    const font = this.fonts.serif;
    for (const line of wrapText(
      font,
      encodable(font, heading),
      SLIDE_TITLE_SIZE,
      SLIDE_CONTENT_WIDTH,
    )) {
      this.y -= SLIDE_TITLE_SIZE;
      this.text(line, {
        x: SLIDE_MARGIN,
        y: this.y,
        size: SLIDE_TITLE_SIZE,
        font,
        color: TEXT_COLOR,
      });
      this.y -= SLIDE_LINE_GAP;
    }
    if (subtitle) {
      this.y -= SLIDE_SUBTITLE_SIZE;
      this.text(subtitle, {
        x: SLIDE_MARGIN,
        y: this.y,
        size: SLIDE_SUBTITLE_SIZE,
        font: this.fonts.regular,
        color: MUTED_COLOR,
      });
    }
    this.y -= SLIDE_BODY_SIZE * 2;
  }

  private continueSlide(): void {
    this.open(`${this.title} (cont.)`);
  }

  /** The Ink cover: eyebrow, the client in serif and the period below it. */
  cover(eyebrow: string, title: string, subtitle: string): void {
    this.title = title;
    this.page = this.inkPage();
    const top = SLIDE_HEIGHT / 2 + 40;
    this.eyebrowAt(eyebrow, SLIDE_MARGIN, top);
    this.text(title, {
      x: SLIDE_MARGIN,
      y: top - 64,
      size: 48,
      font: this.fonts.serif,
      color: WHITE,
    });
    this.text(subtitle, {
      x: SLIDE_MARGIN,
      y: top - 96,
      size: SLIDE_SUBTITLE_SIZE + 2,
      font: this.fonts.regular,
      color: ON_INK_MUTED,
    });
  }

  /** The Ink closing slide. */
  closing(title: string, line: string): void {
    this.page = this.inkPage();
    this.text(title, {
      x: SLIDE_MARGIN,
      y: SLIDE_HEIGHT / 2,
      size: 48,
      font: this.fonts.serif,
      color: WHITE,
    });
    if (line) {
      this.text(line, {
        x: SLIDE_MARGIN,
        y: SLIDE_HEIGHT / 2 - 36,
        size: SLIDE_SUBTITLE_SIZE,
        font: this.fonts.regular,
        color: ON_INK_MUTED,
      });
    }
  }

  slide(title: string, subtitle?: string): void {
    this.title = title;
    this.open(title, subtitle);
  }

  heading(value: string): void {
    this.draw(value, SLIDE_BODY_SIZE, this.fonts.bold, 0);
  }

  bullet(value: string): void {
    this.draw(`•  ${value}`, SLIDE_BODY_SIZE, this.fonts.regular, 12);
  }

  paragraph(value: string): void {
    for (const block of value.split(/\n+/)) {
      this.draw(block, SLIDE_BODY_SIZE, this.fonts.regular, 0);
    }
  }

  /** Up to four headline figures side by side: value in serif, label as an eyebrow, a note. */
  metrics(items: readonly SlideMetric[]): void {
    const shown = items.slice(0, 4);
    if (shown.length === 0) return;
    const gap = 16;
    const height = 120;
    const width = (SLIDE_CONTENT_WIDTH - gap * (shown.length - 1)) / shown.length;
    if (!this.page || this.y - height < SLIDE_MARGIN) this.continueSlide();
    const top = this.y;
    shown.forEach((item, index) => {
      const x = SLIDE_MARGIN + index * (width + gap);
      this.page?.drawRectangle({
        x,
        y: top - height,
        width,
        height,
        borderColor: RULE_COLOR,
        borderWidth: 0.75,
      });
      this.text(item.value, {
        x: x + 16,
        y: top - 48,
        size: 30,
        font: this.fonts.serif,
        color: TEXT_COLOR,
      });
      this.eyebrowAt(item.label, x + 16, top - 76);
      this.text(item.note, {
        x: x + 16,
        y: top - 98,
        size: 10,
        font: this.fonts.regular,
        color: MUTED_COLOR,
      });
    });
    this.y = top - height - SLIDE_BODY_SIZE * 2;
  }

  /** One row per indicator: the previous and current figures as paired bars, then the change. */
  comparison(
    rows: readonly SlideComparison[],
    legend: { previous: string; current: string },
  ): void {
    const rowHeight = 40;
    const labelWidth = 200;
    const textWidth = 180;
    const barWidth = SLIDE_CONTENT_WIDTH - labelWidth - textWidth;
    this.legend(legend);
    for (const row of rows) {
      if (!this.page || this.y - rowHeight < SLIDE_MARGIN) {
        this.continueSlide();
        this.legend(legend);
      }
      const top = this.y;
      const scale = Math.max(Math.abs(row.previous ?? 0), Math.abs(row.current ?? 0)) || 1;
      const bar = (value: number | null, y: number, color: RGB) => {
        if (value === null) return;
        this.page?.drawRectangle({
          x: SLIDE_MARGIN + labelWidth,
          y,
          width: Math.max((Math.abs(value) / scale) * barWidth, 1),
          height: 9,
          color,
        });
      };
      this.text(row.label, {
        x: SLIDE_MARGIN,
        y: top - 20,
        size: 12,
        font: this.fonts.bold,
        color: TEXT_COLOR,
      });
      bar(row.previous, top - 13, BAR_PREVIOUS);
      bar(row.current, top - 25, TEXT_COLOR);
      const textX = SLIDE_MARGIN + labelWidth + barWidth + 16;
      this.text(`${row.previousText} -> ${row.currentText}`, {
        x: textX,
        y: top - 14,
        size: 11,
        font: this.fonts.regular,
        color: TEXT_COLOR,
      });
      this.text(row.change, {
        x: textX,
        y: top - 28,
        size: 10,
        font: this.fonts.regular,
        color: MUTED_COLOR,
      });
      this.page?.drawLine({
        start: { x: SLIDE_MARGIN, y: top - rowHeight + 4 },
        end: { x: SLIDE_WIDTH - SLIDE_MARGIN, y: top - rowHeight + 4 },
        thickness: 0.5,
        color: RULE_COLOR,
      });
      this.y = top - rowHeight;
    }
    this.y -= SLIDE_BODY_SIZE;
  }

  private legend(legend: { previous: string; current: string }): void {
    const y = this.y - 8;
    const entry = (x: number, color: RGB, label: string) => {
      this.page?.drawRectangle({ x, y, width: 10, height: 6, color });
      this.text(label, { x: x + 16, y, size: 9, font: this.fonts.regular, color: MUTED_COLOR });
    };
    entry(SLIDE_MARGIN, BAR_PREVIOUS, legend.previous);
    entry(SLIDE_MARGIN + 140, TEXT_COLOR, legend.current);
    this.y -= 28;
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
