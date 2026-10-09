import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export type ContractPdfSignature = {
  party: string;
  name: string;
  role: string;
  email: string;
  signedAt: string;
  ipAddress: string | null;
};

export type ContractPdfInput = {
  title: string;
  body: string;
  hash: string;
  signatures: ContractPdfSignature[];
  labels: {
    signatures: string;
    fingerprint: string;
    signedBy: string;
    role: string;
    email: string;
    signedAt: string;
    ipAddress: string;
    page: string;
  };
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const BODY_SIZE = 10.5;
const LINE_GAP = 4;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const TEXT_COLOR = rgb(0.1, 0.1, 0.1);
const MUTED_COLOR = rgb(0.4, 0.4, 0.4);

type Fonts = { regular: PDFFont; bold: PDFFont };

/** Keeps only characters the standard WinAnsi fonts can encode. */
function encodable(font: PDFFont, text: string): string {
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

class Writer {
  private page: PDFPage;
  private y = PAGE_HEIGHT - MARGIN;

  constructor(
    private readonly document: PDFDocument,
    private readonly fonts: Fonts,
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

  paragraph(
    text: string,
    options: { size?: number; bold?: boolean; muted?: boolean; indent?: number } = {},
  ): void {
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
}

/** Renders the signed contract text followed by a signature page that serves as evidence. */
export async function buildContractPdf(input: ContractPdfInput): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(input.title);
  document.setSubject(input.hash);
  document.setProducer('Agency OS');
  const fonts: Fonts = {
    regular: await document.embedFont(StandardFonts.Helvetica),
    bold: await document.embedFont(StandardFonts.HelveticaBold),
  };
  const writer = new Writer(document, fonts);

  for (const rawLine of input.body.split('\n')) {
    const line = rawLine.trimEnd();
    if (line === '') {
      writer.space(BODY_SIZE / 2);
    } else if (line.startsWith('## ')) {
      writer.space(6);
      writer.paragraph(line.slice(3), { size: 12, bold: true });
    } else if (line.startsWith('# ')) {
      writer.paragraph(line.slice(2), { size: 16, bold: true });
      writer.space(6);
    } else if (line.startsWith('- ')) {
      writer.paragraph(`- ${line.slice(2)}`, { indent: 12 });
    } else {
      writer.paragraph(line);
    }
  }

  writer.newPage();
  writer.paragraph(input.labels.signatures, { size: 16, bold: true });
  writer.space(8);
  writer.paragraph(input.labels.fingerprint, { bold: true });
  writer.paragraph(input.hash, { muted: true });
  writer.space(12);
  for (const signature of input.signatures) {
    writer.paragraph(signature.party, { size: 12, bold: true });
    writer.paragraph(`${input.labels.signedBy}: ${signature.name}`);
    writer.paragraph(`${input.labels.role}: ${signature.role}`);
    writer.paragraph(`${input.labels.email}: ${signature.email}`);
    writer.paragraph(`${input.labels.signedAt}: ${signature.signedAt}`);
    if (signature.ipAddress) writer.paragraph(`${input.labels.ipAddress}: ${signature.ipAddress}`);
    writer.space(12);
  }

  const pages = document.getPages();
  pages.forEach((page, index) => {
    const label = encodable(
      fonts.regular,
      input.labels.page
        .replace('{page}', String(index + 1))
        .replace('{pages}', String(pages.length)),
    );
    page.drawText(label, {
      x: PAGE_WIDTH - MARGIN - fonts.regular.widthOfTextAtSize(label, 8),
      y: MARGIN / 2,
      size: 8,
      font: fonts.regular,
      color: MUTED_COLOR,
    });
  });

  return document.save();
}
