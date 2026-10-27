import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { createPdf, wrapText } from './pdf';
import { pdfContainsText } from './pdf-testing';

describe('pdf text wrapping', () => {
  it('a word wider than the line is split so no line runs off the page', async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    const link = `https://drive.example.com/folders/${'a1B2c3D4'.repeat(30)}`;

    const lines = wrapText(font, `Pasta: ${link} fim`, 14, 300);

    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) expect(font.widthOfTextAtSize(line, 14)).toBeLessThanOrEqual(300);
    expect(lines.join('').replaceAll(' ', '')).toBe(`Pasta:${link}fim`);
  });
});

describe('branded documents', () => {
  it('sets the eyebrow in spaced mono and the title in serif', async () => {
    const { document, writer } = await createPdf({ title: 'Pedido de pagamento' });
    writer.eyebrow('Pedido de pagamento');
    writer.title('PP-2026-0001');
    writer.rule();
    const pdf = await document.save({ useObjectStreams: false });
    const raw = Buffer.from(pdf).toString('latin1');

    expect(pdfContainsText(pdf, 'PEDIDO DE PAGAMENTO')).toBe(true);
    expect(pdfContainsText(pdf, 'PP-2026-0001')).toBe(true);
    expect(raw).toContain('/BaseFont /Courier');
    expect(raw).toContain('/BaseFont /Times-Roman');
  });
});
